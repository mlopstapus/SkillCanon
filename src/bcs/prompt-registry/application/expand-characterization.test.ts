/**
 * Characterization test (spec SC-007): asserts this feature's TypeScript
 * `expand()` — specifically its legacy-shape resolution path
 * (032-skill-file-format-refactor, FR-010/FR-011) — produces output
 * byte-for-byte identical to the REAL legacy `expand_prompt`
 * (`legacy/backend/src/spechub_server/services/prompt_service.py`) for the
 * same fixture scenarios, composed into the new single-`content` response
 * shape (research.md §2: `content = systemMessage ? (userMessage ?
 * systemMessage + "\n\n" + userMessage : systemMessage) : userMessage`).
 *
 * 032-skill-file-format-refactor removed `expand()`'s `input` parameter
 * entirely, for every caller (PDR-018) — a deliberate, accepted breaking
 * change, not a regression. The harness's `basic`/`systemLess`/
 * `nestedInclusion`/`governedFull` scenarios depended on caller-supplied
 * `{{ tone }}`/`{{ input }}` substitution and can no longer be exercised
 * through the public `expand()` contract at all (there is no calling shape
 * that could supply that data anymore) — they are intentionally dropped
 * here, not silently made to pass. Legacy-shape prepend/append/inject and
 * static-content rendering are still covered, just with hand-written
 * expectations instead of harness parity, in `expand.test.ts` and
 * `expand-governance.test.ts`. What remains meaningfully comparable against
 * the frozen Python harness output are the scenarios that never depended on
 * caller input in the first place (`input: {}` on the Python side too):
 * nested-inclusion depth handling, missing references, cycles, and
 * deprecated/unpublished rejection.
 *
 * `./expand-characterization.fixture.json` is a frozen, one-time recording
 * of the real legacy service's output for these fixture scenarios — it was
 * captured before `legacy/backend/` was deleted (the TypeScript rewrite was
 * complete and every consuming epic archived) and moved here so this parity
 * check keeps working without the Python source it was originally recorded
 * against. It can no longer be regenerated (the recording harness required
 * the legacy Python service code, which no longer exists) — treat it as a
 * permanent, frozen fixture, not a cache to invalidate/refresh.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { expand } from "./expand";
import {
  createUnpublishedSkill,
  makeExpansionFixtureOrg,
  publishDeprecatedSkill,
  publishLegacySkill,
  type ExpansionFixtureOrg,
} from "./expansion-test-helpers";

const HARNESS_OUTPUT_PATH = fileURLToPath(
  new URL(
    "./expand-characterization.fixture.json",
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

/** Mirrors expand.ts's exact legacy-shape compose formula (research.md §2). */
function composedContent(scenario: HarnessScenarioResult): string {
  const system = scenario.systemMessage ?? null;
  const user = scenario.userMessage ?? "";
  return system ? (user ? `${system}\n\n${user}` : system) : user;
}

describe("expand — characterization parity against legacy expand_prompt, legacy-shape path only (SC-007)", () => {
  let testDb: TestDb;
  let harnessOutput: Record<string, HarnessScenarioResult>;
  let fixture: ExpansionFixtureOrg;

  beforeAll(async () => {
    testDb = await startTestDb();
    harnessOutput = loadHarnessOutput();
    fixture = await makeExpansionFixtureOrg(testDb);

    // --- depthAtLimit: chain nested exactly to MAX_INCLUDE_DEPTH (3). ---
    await publishLegacySkill(testDb, fixture, { name: "chain-3", userTemplate: "C3-content" });
    await publishLegacySkill(testDb, fixture, { name: "chain-2", userTemplate: "C2[{{ include_prompt('chain-3') }}]" });
    await publishLegacySkill(testDb, fixture, { name: "chain-1", userTemplate: "C1[{{ include_prompt('chain-2') }}]" });
    await publishLegacySkill(testDb, fixture, { name: "chain-0", userTemplate: "C0[{{ include_prompt('chain-1') }}]" });

    // --- depthExceeded: one level past the limit. ---
    await publishLegacySkill(testDb, fixture, {
      name: "chain-4b",
      userTemplate: "C4-content (should not appear)",
    });
    await publishLegacySkill(testDb, fixture, { name: "chain-3b", userTemplate: "C3[{{ include_prompt('chain-4b') }}]" });
    await publishLegacySkill(testDb, fixture, { name: "chain-2b", userTemplate: "C2[{{ include_prompt('chain-3b') }}]" });
    await publishLegacySkill(testDb, fixture, { name: "chain-1b", userTemplate: "C1[{{ include_prompt('chain-2b') }}]" });
    await publishLegacySkill(testDb, fixture, { name: "chain-0b", userTemplate: "C0[{{ include_prompt('chain-1b') }}]" });

    // --- missingRef: reference to a nonexistent skill. ---
    await publishLegacySkill(testDb, fixture, {
      name: "missing-ref-skill",
      userTemplate: "Before. {{ include_prompt('does-not-exist') }} After.",
    });

    // --- cycle: cyclic reference pair. ---
    await publishLegacySkill(testDb, fixture, { name: "cycle-a", userTemplate: "A[{{ include_prompt('cycle-b') }}]" });
    await publishLegacySkill(testDb, fixture, { name: "cycle-b", userTemplate: "B[{{ include_prompt('cycle-a') }}]" });

    // --- deprecatedReject / unpublishedReject. ---
    await publishDeprecatedSkill(testDb, fixture, { name: "deprecated-skill", content: "should not render" });
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

  it("depthAtLimit", async () => {
    const result = await runExpand({ promptName: "chain-0" });
    expect(result.content).toBe(composedContent(harnessOutput.depthAtLimit as HarnessScenarioResult));
  });

  it("depthExceeded", async () => {
    const result = await runExpand({ promptName: "chain-0b" });
    expect(result.content).toBe(composedContent(harnessOutput.depthExceeded as HarnessScenarioResult));
  });

  it("missingRef", async () => {
    const result = await runExpand({ promptName: "missing-ref-skill" });
    expect(result.content).toBe(composedContent(harnessOutput.missingRef as HarnessScenarioResult));
  });

  it("cycle", async () => {
    const result = await runExpand({ promptName: "cycle-a" });
    expect(result.content).toBe(composedContent(harnessOutput.cycle as HarnessScenarioResult));
  });

  it("deprecatedReject", async () => {
    expect(harnessOutput.deprecatedReject).toEqual({ rejected: true });
    await expect(runExpand({ promptName: "deprecated-skill" })).rejects.toThrow();
  });

  it("unpublishedReject", async () => {
    expect(harnessOutput.unpublishedReject).toEqual({ rejected: true });
    await expect(runExpand({ promptName: "never-published" })).rejects.toThrow();
  });
});
