/**
 * Characterization test (spec SC-007): asserts this feature's TypeScript
 * `expand()` produces output byte-for-byte identical to the REAL legacy
 * `expand_prompt` (`legacy/backend/src/spechub_server/services/prompt_service.py`)
 * for the same fixture scenarios.
 *
 * The legacy side is never re-run from this test (no Python/`uv` dependency
 * at `vitest` time) — `legacy/backend/scratch/expand_characterization_harness.py`
 * (T012) is run once via `uv run` to *record* its output to
 * `expand_characterization_output.json` in the same directory, and this test
 * reads that recorded JSON file. This is not a hardcoded copy: the file is
 * the harness's own program output, not hand-transcribed — re-running the
 * harness after a template/policy/objective literal changes on the Python
 * side regenerates it. See that harness file's module docstring for why a
 * shared cross-language JSON *fixture* input was rejected in favor of
 * hand-mirrored literals (schemas differ too much for a shared input to be
 * simpler than shared output comparison).
 *
 * Every literal value below (skill names, template strings, policy/objective
 * names and content, caller input) is intentionally identical to the
 * corresponding scenario in `expand_characterization_harness.py` — if you
 * change one side, change the other.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { expand } from "./expand";
import {
  grantObjective,
  grantPolicy,
  makeExpansionFixtureOrg,
  publishDeprecatedSkill,
  publishSkill,
  createUnpublishedSkill,
  type ExpansionFixtureOrg,
} from "./expansion-test-helpers";

const HARNESS_OUTPUT_PATH = fileURLToPath(
  new URL(
    "../../../../legacy/backend/scratch/expand_characterization_output.json",
    import.meta.url,
  ),
);

interface HarnessScenarioResult {
  rejected?: boolean;
  systemMessage?: string | null;
  userMessage?: string;
  appliedPolicies?: string[];
  objectives?: string[];
}

function loadHarnessOutput(): Record<string, HarnessScenarioResult> {
  const raw = readFileSync(HARNESS_OUTPUT_PATH, "utf-8");
  return JSON.parse(raw) as Record<string, HarnessScenarioResult>;
}

describe("expand — characterization parity against legacy expand_prompt (SC-007)", () => {
  let testDb: TestDb;
  let harnessOutput: Record<string, HarnessScenarioResult>;
  let fixture: ExpansionFixtureOrg;

  beforeAll(async () => {
    testDb = await startTestDb();
    harnessOutput = loadHarnessOutput();
    fixture = await makeExpansionFixtureOrg(testDb);

    // --- basic: substitution, both system and user templates. ---
    await publishSkill(testDb, fixture, {
      name: "basic-greet",
      systemTemplate: "You are a {{ tone }} assistant.",
      userTemplate: "Say hello to {{ input }}.",
    });

    // --- systemLess: no system template. ---
    await publishSkill(testDb, fixture, {
      name: "system-less",
      systemTemplate: null,
      userTemplate: "Only user content: {{ input }}",
    });

    // --- nestedInclusion: single-level inclusion. ---
    await publishSkill(testDb, fixture, {
      name: "included-skill",
      systemTemplate: "You are a {{ tone }} assistant.",
      userTemplate: "Say hello to {{ input }}.",
    });
    await publishSkill(testDb, fixture, {
      name: "includer-skill",
      userTemplate: "Intro: {{ include_prompt('included-skill') }}\nEnd.",
    });

    // --- depthAtLimit: chain nested exactly to MAX_INCLUDE_DEPTH (3). ---
    await publishSkill(testDb, fixture, { name: "chain-3", userTemplate: "C3-content" });
    await publishSkill(testDb, fixture, { name: "chain-2", userTemplate: "C2[{{ include_prompt('chain-3') }}]" });
    await publishSkill(testDb, fixture, { name: "chain-1", userTemplate: "C1[{{ include_prompt('chain-2') }}]" });
    await publishSkill(testDb, fixture, { name: "chain-0", userTemplate: "C0[{{ include_prompt('chain-1') }}]" });

    // --- depthExceeded: one level past the limit. ---
    await publishSkill(testDb, fixture, {
      name: "chain-4b",
      userTemplate: "C4-content (should not appear)",
    });
    await publishSkill(testDb, fixture, { name: "chain-3b", userTemplate: "C3[{{ include_prompt('chain-4b') }}]" });
    await publishSkill(testDb, fixture, { name: "chain-2b", userTemplate: "C2[{{ include_prompt('chain-3b') }}]" });
    await publishSkill(testDb, fixture, { name: "chain-1b", userTemplate: "C1[{{ include_prompt('chain-2b') }}]" });
    await publishSkill(testDb, fixture, { name: "chain-0b", userTemplate: "C0[{{ include_prompt('chain-1b') }}]" });

    // --- missingRef: reference to a nonexistent skill. ---
    await publishSkill(testDb, fixture, {
      name: "missing-ref-skill",
      userTemplate: "Before. {{ include_prompt('does-not-exist') }} After.",
    });

    // --- cycle: cyclic reference pair. ---
    await publishSkill(testDb, fixture, { name: "cycle-a", userTemplate: "A[{{ include_prompt('cycle-b') }}]" });
    await publishSkill(testDb, fixture, { name: "cycle-b", userTemplate: "B[{{ include_prompt('cycle-a') }}]" });

    // --- governedFull: prepend + append + inject policies, plus a team objective. ---
    await publishSkill(testDb, fixture, {
      name: "governed-full",
      systemTemplate: "Base system.",
      userTemplate: "Guidance: {{ policies }}\nGoals: {{ objectives }}\nTask: {{ input }}.",
    });
    await grantPolicy(testDb, fixture, fixture.teamId, {
      name: "safety-rules",
      enforcementType: "prepend",
      content: "Follow safety rules.",
      priority: 10,
    });
    await grantPolicy(testDb, fixture, fixture.teamId, {
      name: "cite-sources",
      enforcementType: "append",
      content: "Cite your sources.",
      priority: 5,
    });
    await grantPolicy(testDb, fixture, fixture.teamId, {
      name: "formal-tone",
      enforcementType: "inject",
      content: "Use a formal tone.",
      priority: 0,
    });
    await grantObjective(testDb, fixture, { teamId: fixture.teamId }, "Reduce latency");

    // --- deprecatedReject / unpublishedReject. ---
    await publishDeprecatedSkill(testDb, fixture, { name: "deprecated-skill", userTemplate: "should not render" });
    await createUnpublishedSkill(testDb, fixture, "never-published");
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  async function runExpand(params: Omit<Parameters<typeof expand>[1], "organizationId">) {
    return withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      expand(tx, { organizationId: fixture.organizationId, ...params }),
    );
  }

  it("basic", async () => {
    const result = await runExpand({ promptName: "basic-greet", input: { tone: "friendly", input: "world" } });
    expect(result).toEqual(harnessOutput.basic);
  });

  it("systemLess", async () => {
    const result = await runExpand({ promptName: "system-less", input: { input: "x" } });
    expect(result).toEqual(harnessOutput.systemLess);
  });

  it("nestedInclusion", async () => {
    const result = await runExpand({ promptName: "includer-skill", input: { tone: "formal", input: "Bob" } });
    expect(result).toEqual(harnessOutput.nestedInclusion);
  });

  it("depthAtLimit", async () => {
    const result = await runExpand({ promptName: "chain-0", input: {} });
    expect(result).toEqual(harnessOutput.depthAtLimit);
  });

  it("depthExceeded", async () => {
    const result = await runExpand({ promptName: "chain-0b", input: {} });
    expect(result).toEqual(harnessOutput.depthExceeded);
  });

  it("missingRef", async () => {
    const result = await runExpand({ promptName: "missing-ref-skill", input: {} });
    expect(result).toEqual(harnessOutput.missingRef);
  });

  it("cycle", async () => {
    const result = await runExpand({ promptName: "cycle-a", input: {} });
    expect(result).toEqual(harnessOutput.cycle);
  });

  it("governedFull", async () => {
    const result = await runExpand({
      promptName: "governed-full",
      input: { input: "draft the report" },
      userId: fixture.actorUserId,
    });
    expect(result).toEqual(harnessOutput.governedFull);
  });

  it("deprecatedReject", async () => {
    expect(harnessOutput.deprecatedReject).toEqual({ rejected: true });
    await expect(runExpand({ promptName: "deprecated-skill", input: {} })).rejects.toThrow();
  });

  it("unpublishedReject", async () => {
    expect(harnessOutput.unpublishedReject).toEqual({ rejected: true });
    await expect(runExpand({ promptName: "never-published", input: {} })).rejects.toThrow();
  });
});
