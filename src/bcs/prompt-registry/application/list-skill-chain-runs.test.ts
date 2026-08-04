import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { findPromptByOrgAndName } from "../infrastructure/prompts-repo";
import { listSkillChainRuns } from "./list-skill-chain-runs";
import { publishVersion } from "./publish-version";
import {
  makeChainFixtureOrg,
  publishThreeStepChain,
  type ChainFixtureOrg,
} from "./skill-chain-test-helpers";
import { startSkillChainRun } from "./start-skill-chain-run";

describe("listSkillChainRuns", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  async function start(fixture: ChainFixtureOrg, promptName: string, version?: string) {
    return withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      startSkillChainRun(tx, fixture.actor, promptName, version),
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

    const page = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      listSkillChainRuns(tx, fixture.organizationId, promptRow.id),
    );

    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(2);
    expect(page.items.map((r) => r.id).sort()).toEqual([runA1.runId, runA2.runId].sort());
    expect(page.items[0]?.startedAt.getTime()).toBeGreaterThanOrEqual(
      page.items[1]?.startedAt.getTime() ?? 0,
    );
  });

  it("returns an empty page, not an error, for a chain with zero runs", async () => {
    const fixture = await makeChainFixtureOrg(testDb);
    const chain = await publishThreeStepChain(testDb, fixture, "no-runs-chain");

    const promptRow = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      findPromptByOrgAndName(tx, fixture.organizationId, chain.promptName),
    );
    if (!promptRow) throw new Error("expected prompt row");

    const page = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      listSkillChainRuns(tx, fixture.organizationId, promptRow.id),
    );
    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
    expect(page.page).toBe(1);
  });

  it("paginates: a requested page/pageSize returns only that slice, with an accurate total", async () => {
    const fixture = await makeChainFixtureOrg(testDb);
    const chain = await publishThreeStepChain(testDb, fixture, "paginated-chain");

    for (let i = 0; i < 5; i += 1) {
      await start(fixture, chain.promptName);
    }

    const promptRow = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      findPromptByOrgAndName(tx, fixture.organizationId, chain.promptName),
    );
    if (!promptRow) throw new Error("expected prompt row");

    const firstPage = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      listSkillChainRuns(tx, fixture.organizationId, promptRow.id, { page: 1, pageSize: 2 }),
    );
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.total).toBe(5);
    expect(firstPage.page).toBe(1);
    expect(firstPage.pageSize).toBe(2);

    const secondPage = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      listSkillChainRuns(tx, fixture.organizationId, promptRow.id, { page: 2, pageSize: 2 }),
    );
    expect(secondPage.items).toHaveLength(2);
    expect(secondPage.items.map((r) => r.id)).not.toEqual(firstPage.items.map((r) => r.id));
  });

  it("reports which chain version each run actually executed, across two published versions", async () => {
    const fixture = await makeChainFixtureOrg(testDb);
    const chain = await publishThreeStepChain(testDb, fixture, "multi-version-chain");
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      publishVersion(tx, fixture.actor, {
        organizationId: fixture.organizationId,
        promptName: chain.promptName,
        version: "2.0.0",
        steps: chain.steps,
      }),
    );

    const runV1 = await start(fixture, chain.promptName, "1.0.0");
    const runV2 = await start(fixture, chain.promptName, "2.0.0");
    if (!("runId" in runV1) || !("runId" in runV2)) throw new Error("expected runIds");

    const promptRow = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      findPromptByOrgAndName(tx, fixture.organizationId, chain.promptName),
    );
    if (!promptRow) throw new Error("expected prompt row");

    const page = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      listSkillChainRuns(tx, fixture.organizationId, promptRow.id),
    );

    const versionByRunId = new Map(page.items.map((r) => [r.id, r.version]));
    expect(versionByRunId.get(runV1.runId)).toBe("1.0.0");
    expect(versionByRunId.get(runV2.runId)).toBe("2.0.0");
  });
});
