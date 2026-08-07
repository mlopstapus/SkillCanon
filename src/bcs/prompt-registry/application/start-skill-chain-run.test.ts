import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { PromptNotFoundError } from "../domain/prompt";
import {
  ChainStepResolutionFailedError,
  InvalidChainDependencyError,
  NotAChainVersionError,
} from "../domain/skill-chain";
import { expand } from "./expand";
import { queryPromptAuditEvents } from "./prompt-test-helpers";
import {
  makeChainFixtureOrg,
  publishChain,
  publishStepSkill,
  publishThreeStepChain,
  queryChainRunRows,
  queryChainRunStepRows,
  type ChainFixtureOrg,
} from "./skill-chain-test-helpers";
import { startSkillChainRun } from "./start-skill-chain-run";

describe("startSkillChainRun", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  async function run(fixture: ChainFixtureOrg, promptName: string, version?: string) {
    return withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      startSkillChainRun(tx, fixture.actor, promptName, version),
    );
  }

  it("resolves step 1's content identically to a direct expand() call for that skill/version", async () => {
    const fixture = await makeChainFixtureOrg(testDb);
    const chain = await publishThreeStepChain(testDb, fixture);

    const result = await run(fixture, chain.promptName);
    if (!("step" in result)) {
      throw new Error("expected a step resolution, got done: true");
    }

    const directExpansion = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      expand(tx, {
        organizationId: fixture.organizationId,
        promptName: `${chain.promptName}-a`,
        userId: fixture.actorUserId,
      }),
    );

    expect(result.step.stepId).toBe("step1");
    expect(result.step.stepIndex).toBe(0);
    expect(result.step.promptName).toBe(`${chain.promptName}-a`);
    expect(result.step.content).toBe(directExpansion.content);
  });

  it("completes a zero-step chain immediately with one audit event and zero run-step rows", async () => {
    const fixture = await makeChainFixtureOrg(testDb);
    const version = await publishChain(testDb, fixture, { name: "empty-chain", steps: [] });

    const result = await run(fixture, "empty-chain");

    expect(result).toEqual({ runId: expect.any(String), done: true });
    const runRows = await queryChainRunRows(testDb, sql`id = ${(result as { runId: string }).runId}`);
    expect(runRows).toHaveLength(1);
    expect(runRows[0]?.status).toBe("completed");
    expect(runRows[0]?.prompt_version_id).toBe(version.id);

    const stepRows = await queryChainRunStepRows(
      testDb,
      sql`run_id = ${(result as { runId: string }).runId}`,
    );
    expect(stepRows).toHaveLength(0);

    const events = await queryPromptAuditEvents(
      testDb,
      sql`action = 'skill_chain_run.completed' and resource_id = ${(result as { runId: string }).runId}`,
    );
    expect(events).toHaveLength(1);
  });

  it("throws NotAChainVersionError for a template-kind version", async () => {
    const fixture = await makeChainFixtureOrg(testDb);
    await publishStepSkill(testDb, fixture, { name: "just-a-template", content: "hi" });

    await expect(run(fixture, "just-a-template")).rejects.toBeInstanceOf(NotAChainVersionError);
  });

  it("throws PromptNotFoundError for a caller without access to the chain", async () => {
    const fixture = await makeChainFixtureOrg(testDb);
    // Owned by `ownerType: "user"`/`fixture.actorUserId` (createPrompt's
    // default) — `otherUserId` shares the same team but has no personal
    // ownership, subscription, or project-membership grant to it, so it is
    // genuinely inaccessible despite being in the same organization.
    await publishThreeStepChain(testDb, fixture, "inaccessible-chain");

    const strangerActor = { organizationId: fixture.organizationId, userId: fixture.otherUserId };
    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        startSkillChainRun(tx, strangerActor, "inaccessible-chain"),
      ),
    ).rejects.toBeInstanceOf(PromptNotFoundError);
  });

  it("rejects a chain with an invalid dependency and creates no run row", async () => {
    const fixture = await makeChainFixtureOrg(testDb);
    await publishStepSkill(testDb, fixture, { name: "invalid-dep-a", content: "a" });
    await publishChain(testDb, fixture, {
      name: "invalid-dep-chain",
      steps: [
        { id: "step1", promptName: "invalid-dep-a", dependsOn: ["step1"] }, // self-reference
      ],
    });

    await expect(run(fixture, "invalid-dep-chain")).rejects.toBeInstanceOf(InvalidChainDependencyError);

    const runRows = await queryChainRunRows(testDb, sql`organization_id = ${fixture.organizationId}`);
    expect(runRows).toHaveLength(0);
  });

  it("throws ChainStepResolutionFailedError and creates no run row when step 1's target skill does not exist (FR-011)", async () => {
    const fixture = await makeChainFixtureOrg(testDb);
    await publishChain(testDb, fixture, {
      name: "broken-first-step",
      steps: [{ id: "step1", promptName: "nonexistent-skill-xyz", dependsOn: [] }],
    });

    await expect(run(fixture, "broken-first-step")).rejects.toBeInstanceOf(ChainStepResolutionFailedError);

    // Whole call rolls back — no partial run is ever left behind, matching
    // how every other validation failure (e.g. InvalidChainDependencyError)
    // already behaves in this codebase (research.md).
    const runRows = await queryChainRunRows(testDb, sql`organization_id = ${fixture.organizationId}`);
    expect(runRows).toHaveLength(0);
  });
});
