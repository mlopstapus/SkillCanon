import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { findPromptByOrgAndName } from "../infrastructure/prompts-repo";
import { listSkillChainRuns } from "./list-skill-chain-runs";
import { makeChainFixtureOrg, publishThreeStepChain, type ChainFixtureOrg } from "./skill-chain-test-helpers";
import { startSkillChainRun } from "./start-skill-chain-run";

describe("listSkillChainRuns", () => {
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

  it("returns every run for a chain, most recent first, and never a different chain's runs", async () => {
    const fixture = await makeChainFixtureOrg(testDb);
    const chainA = await publishThreeStepChain(testDb, fixture, "list-runs-chain-a");
    const chainB = await publishThreeStepChain(testDb, fixture, "list-runs-chain-b");

    const runA1 = await start(fixture, chainA.promptName);
    const runA2 = await start(fixture, chainA.promptName);
    await start(fixture, chainB.promptName);

    if (!("runId" in runA1) || !("runId" in runA2)) throw new Error("expected runIds");

    const promptRow = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      findPromptByOrgAndName(tx, fixture.organizationId, chainA.promptName),
    );
    if (!promptRow) throw new Error("expected prompt row");

    const runs = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      listSkillChainRuns(tx, fixture.organizationId, promptRow.id),
    );

    expect(runs).toHaveLength(2);
    expect(runs.map((r) => r.id).sort()).toEqual([runA1.runId, runA2.runId].sort());
    expect(runs[0]?.startedAt.getTime()).toBeGreaterThanOrEqual(runs[1]?.startedAt.getTime() ?? 0);
  });

  it("returns an empty array, not an error, for a chain with zero runs", async () => {
    const fixture = await makeChainFixtureOrg(testDb);
    const chain = await publishThreeStepChain(testDb, fixture, "no-runs-chain");

    const promptRow = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      findPromptByOrgAndName(tx, fixture.organizationId, chain.promptName),
    );
    if (!promptRow) throw new Error("expected prompt row");

    const runs = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      listSkillChainRuns(tx, fixture.organizationId, promptRow.id),
    );
    expect(runs).toEqual([]);
  });
});
