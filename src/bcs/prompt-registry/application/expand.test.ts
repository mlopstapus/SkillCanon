import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPromptUsageSummaryForProject } from "@/bcs/distribution";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { ExpansionSourceNotFoundError } from "../domain/expansion";
import { createPrompt } from "./create-prompt";
import { expand } from "./expand";
import { publishVersion } from "./publish-version";
import {
  createUnpublishedSkill,
  makeExpansionFixtureOrg,
  publishAnotherVersion,
  publishDeprecatedSkill,
  publishLegacySkill,
  publishSkill,
  type ExpansionFixtureOrg,
} from "./expansion-test-helpers";

describe("expand (US1/US2 — new-shape, ungoverned rendering; US4 — legacy-shape compatibility)", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  async function runExpand(fixture: ExpansionFixtureOrg, params: Omit<Parameters<typeof expand>[1], "organizationId">) {
    return withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      expand(tx, { organizationId: fixture.organizationId, ...params }),
    );
  }

  it("resolves a new-shape version's main file content verbatim, with no caller-supplied data (FR-002/FR-003)", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    await publishSkill(testDb, fixture, {
      name: "basic-greet",
      content: "You are a helpful assistant. Say hello.",
    });

    const result = await runExpand(fixture, { promptName: "basic-greet" });

    expect(result.content).toBe("You are a helpful assistant. Say hello.");
    expect(result.appliedPolicies).toEqual([]);
    expect(result.objectives).toEqual([]);
  });

  it("rejects a skill with no published version yet, same as a nonexistent skill (AC3)", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    await createUnpublishedSkill(testDb, fixture, "never-published");

    await expect(runExpand(fixture, { promptName: "never-published" })).rejects.toThrow(
      ExpansionSourceNotFoundError,
    );
  });

  it("rejects a chain version the same way it rejects any other unresolvable version (026-skill-chains, PDR-017)", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      createPrompt(tx, fixture.actor, { organizationId: fixture.organizationId, name: "a-chain-skill" }),
    );
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      publishVersion(tx, fixture.actor, {
        organizationId: fixture.organizationId,
        promptName: "a-chain-skill",
        version: "1.0.0",
        steps: [{ id: "step1", promptName: "whatever", dependsOn: [] }],
      }),
    );

    await expect(runExpand(fixture, { promptName: "a-chain-skill" })).rejects.toThrow(
      ExpansionSourceNotFoundError,
    );
  });

  it("rejects a nonexistent skill", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);

    await expect(runExpand(fixture, { promptName: "does-not-exist" })).rejects.toThrow(
      ExpansionSourceNotFoundError,
    );
  });

  it("rejects a deprecated skill even when its default version is requested (AC4)", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    await publishDeprecatedSkill(testDb, fixture, {
      name: "deprecated-default",
      content: "should not render",
    });

    await expect(runExpand(fixture, { promptName: "deprecated-default" })).rejects.toThrow(
      ExpansionSourceNotFoundError,
    );
  });

  it("rejects a deprecated skill even when a specific still-existing version is explicitly requested (AC4)", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    await publishDeprecatedSkill(testDb, fixture, {
      name: "deprecated-explicit",
      content: "should not render",
      version: "1.0.0",
    });

    await expect(
      runExpand(fixture, { promptName: "deprecated-explicit", version: "1.0.0" }),
    ).rejects.toThrow(ExpansionSourceNotFoundError);
  });

  it("fails visibly rather than rendering blank when a main file references an undefined variable — no caller input ever exists to supply one (AC5)", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    await publishSkill(testDb, fixture, { name: "undefined-var", content: "Needs {{ not_supplied }}." });

    await expect(runExpand(fixture, { promptName: "undefined-var" })).rejects.toThrow();
  });

  it("never executes template content attempting arbitrary code — only registered globals are callable (AC6)", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    // No `process`/`require`/filesystem global is ever registered — a
    // template attempting to reach one is just another undefined reference,
    // which `throwOnUndefined: true` rejects rather than executing anything.
    await publishSkill(testDb, fixture, {
      name: "code-exec-attempt",
      content: "{{ process.env.SECRET }}",
    });

    await expect(runExpand(fixture, { promptName: "code-exec-attempt" })).rejects.toThrow();
  });

  it("uses the currently-active version when multiple versions exist and none is pinned", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    await publishSkill(testDb, fixture, { name: "multi-version", content: "v1 content" });
    await publishAnotherVersion(testDb, fixture, { name: "multi-version", content: "v2 content" });

    const result = await runExpand(fixture, { promptName: "multi-version" });

    // publishVersion advances activeVersionId to the newest publish.
    expect(result.content).toBe("v2 content");
  });

  it("uses an explicitly requested version rather than the active one", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    await publishSkill(testDb, fixture, { name: "pinned-version", content: "v1 content" });
    await publishAnotherVersion(testDb, fixture, { name: "pinned-version", content: "v2 content" });

    const result = await runExpand(fixture, {
      promptName: "pinned-version",
      version: "1.0.0",
    });

    expect(result.content).toBe("v1 content");
  });

  it("never records a distribution.prompt_usage row — a live-preview/test call must never count as usage (spec FR-002a, 024-project-usage-metrics-dashboard)", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    await publishSkill(testDb, fixture, { name: "no-usage-recorded", content: "hi" });
    const projectId = randomUUID();

    const before = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      getPromptUsageSummaryForProject(tx, fixture.organizationId, projectId, { activeWindowDays: 30, trendDays: 14 }),
    );

    await runExpand(fixture, {
      promptName: "no-usage-recorded",
      userId: fixture.actor.userId,
      projectId,
    });

    const after = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      getPromptUsageSummaryForProject(tx, fixture.organizationId, projectId, { activeWindowDays: 30, trendDays: 14 }),
    );

    expect(after.totalInvocations).toBe(before.totalInvocations);
    expect(after.totalInvocations).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Legacy-shape compatibility (User Story 4, FR-010/FR-011)
  // -------------------------------------------------------------------------

  it("resolves a legacy-shape version (published before this feature shipped) without error, composing its system+user content into the new single-content shape", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    await publishLegacySkill(testDb, fixture, {
      name: "legacy-both",
      systemTemplate: "Be helpful.",
      userTemplate: "Static instructions.",
    });

    const result = await runExpand(fixture, { promptName: "legacy-both" });

    expect(result.content).toBe("Be helpful.\n\nStatic instructions.");
  });

  it("resolves a legacy-shape version with only a user template (no synthetic '{{ input }}' crash)", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    await publishLegacySkill(testDb, fixture, {
      name: "legacy-user-only",
      systemTemplate: null,
      userTemplate: "Just user content.",
    });

    const result = await runExpand(fixture, { promptName: "legacy-user-only" });

    expect(result.content).toBe("Just user content.");
  });

  it("resolves a legacy-shape version with no user template at all, using an empty default rather than throwing", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    await publishLegacySkill(testDb, fixture, {
      name: "legacy-system-only",
      systemTemplate: "System only.",
      userTemplate: null,
    });

    const result = await runExpand(fixture, { promptName: "legacy-system-only" });

    expect(result.content).toBe("System only.");
  });
});
