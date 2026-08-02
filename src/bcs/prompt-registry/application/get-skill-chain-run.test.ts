import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { advanceSkillChainRun } from "./advance-skill-chain-run";
import { getSkillChainRun } from "./get-skill-chain-run";
import { makeChainFixtureOrg, publishThreeStepChain, type ChainFixtureOrg } from "./skill-chain-test-helpers";
import { startSkillChainRun } from "./start-skill-chain-run";

describe("getSkillChainRun", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  async function start(fixture: ChainFixtureOrg, promptName: string) {
    return withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      startSkillChainRun(tx, fixture.actor, promptName),
    );
  }

  async function advance(
    fixture: ChainFixtureOrg,
    runId: string,
    report: Parameters<typeof advanceSkillChainRun>[3],
  ) {
    return withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      advanceSkillChainRun(tx, fixture.actor, runId, report),
    );
  }

  async function getRun(fixture: ChainFixtureOrg, runId: string) {
    return withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      getSkillChainRun(tx, fixture.organizationId, runId),
    );
  }

  it("returns a completed run's full step history matching exactly what was sent and reported live", async () => {
    const fixture = await makeChainFixtureOrg(testDb);
    const chain = await publishThreeStepChain(testDb, fixture, "history-chain");
    const started = await start(fixture, chain.promptName);
    if (!("step" in started)) throw new Error("expected a step");

    await advance(fixture, started.runId, { stepIndex: 0, status: "success", output: "s1-out" });
    await advance(fixture, started.runId, { stepIndex: 1, status: "success", output: "s2-out" });
    await advance(fixture, started.runId, { stepIndex: 2, status: "success", output: "s3-out" });

    const result = await getRun(fixture, started.runId);
    if (!result) throw new Error("expected a run");

    expect(result.run.status).toBe("completed");
    expect(result.steps).toHaveLength(3);
    expect(result.steps.map((s) => s.stepIndex)).toEqual([0, 1, 2]);
    expect(result.steps[0]?.userMessage).toBe(started.step.userMessage);
    expect(result.steps[0]?.reportedStatus).toBe("success");
    expect(result.steps[0]?.reportedOutput).toBe("s1-out");
    expect(result.steps[2]?.reportedOutput).toBe("s3-out");
  });

  it("is a pure read — calling it twice against an in-progress run returns identical results and never advances the run", async () => {
    const fixture = await makeChainFixtureOrg(testDb);
    const chain = await publishThreeStepChain(testDb, fixture, "pure-read-chain");
    const started = await start(fixture, chain.promptName);
    if (!("runId" in started)) throw new Error("expected a runId");

    const first = await getRun(fixture, started.runId);
    const second = await getRun(fixture, started.runId);

    expect(first).toEqual(second);
    expect(first?.run.status).toBe("in_progress");
    expect(first?.run.currentStepIndex).toBe(0);
  });

  it("returns null for a run belonging to a different organization, same as a nonexistent run", async () => {
    const fixtureA = await makeChainFixtureOrg(testDb);
    const fixtureB = await makeChainFixtureOrg(testDb);
    const chain = await publishThreeStepChain(testDb, fixtureA, "cross-org-history-chain");
    const started = await start(fixtureA, chain.promptName);
    if (!("runId" in started)) throw new Error("expected a runId");

    const crossOrgResult = await getRun(fixtureB, started.runId);
    expect(crossOrgResult).toBeNull();

    const nonexistentResult = await getRun(fixtureA, "00000000-0000-0000-0000-000000000000");
    expect(nonexistentResult).toBeNull();
  });
});
