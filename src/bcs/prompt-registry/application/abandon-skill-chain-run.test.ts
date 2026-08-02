import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { RunAlreadyFinishedError } from "../domain/skill-chain";
import { abandonSkillChainRun } from "./abandon-skill-chain-run";
import { queryPromptAuditEvents } from "./prompt-test-helpers";
import {
  makeChainFixtureOrg,
  publishThreeStepChain,
  queryChainRunRows,
  queryChainRunStepRows,
  type ChainFixtureOrg,
} from "./skill-chain-test-helpers";
import { startSkillChainRun } from "./start-skill-chain-run";

describe("abandonSkillChainRun", () => {
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

  async function abandon(fixture: ChainFixtureOrg, runId: string) {
    return withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      abandonSkillChainRun(tx, fixture.actor, runId),
    );
  }

  it("marks an in-progress run abandoned, leaving the pending step's reportedStatus null, with one audit event", async () => {
    const fixture = await makeChainFixtureOrg(testDb);
    const chain = await publishThreeStepChain(testDb, fixture, "abandon-chain");
    const started = await start(fixture, chain.promptName);
    if (!("runId" in started)) throw new Error("expected a runId");

    await abandon(fixture, started.runId);

    const runRows = await queryChainRunRows(testDb, sql`id = ${started.runId}`);
    expect(runRows[0]?.status).toBe("abandoned");
    expect(runRows[0]?.completed_at).not.toBeNull();

    const stepRows = await queryChainRunStepRows(testDb, sql`run_id = ${started.runId} and step_index = 0`);
    expect(stepRows[0]?.reported_status).toBeNull();

    const events = await queryPromptAuditEvents(
      testDb,
      sql`action = 'skill_chain_run.abandoned' and resource_id = ${started.runId}`,
    );
    expect(events).toHaveLength(1);
  });

  it("rejects abandoning a run that has already finished", async () => {
    const fixture = await makeChainFixtureOrg(testDb);
    const chain = await publishThreeStepChain(testDb, fixture, "double-abandon-chain");
    const started = await start(fixture, chain.promptName);
    if (!("runId" in started)) throw new Error("expected a runId");

    await abandon(fixture, started.runId);

    await expect(abandon(fixture, started.runId)).rejects.toBeInstanceOf(RunAlreadyFinishedError);
  });
});
