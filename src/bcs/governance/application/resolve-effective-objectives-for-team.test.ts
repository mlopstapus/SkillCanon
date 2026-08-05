import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { resolveEffectiveObjectivesForTeam } from "./resolve-effective-objectives-for-team";
import {
  createObjectiveFixtureTeam,
  insertObjectiveRow,
  makeObjectiveFixtureOrg,
} from "./objective-test-helpers";

async function makeObjectiveHierarchy(testDb: TestDb) {
  const fixture = await makeObjectiveFixtureOrg(testDb);
  const rootTeamId = fixture.teamId;
  const parentTeamId = await createObjectiveFixtureTeam(testDb, fixture, {
    parentTeamId: rootTeamId,
    name: "Parent",
  });
  const childTeamId = await createObjectiveFixtureTeam(testDb, fixture, {
    parentTeamId,
    name: "Child",
  });
  return { ...fixture, rootTeamId, parentTeamId, childTeamId };
}

describe("resolveEffectiveObjectivesForTeam", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("splits inherited (ancestor teams) from local (the team itself) for a bare team scope", async () => {
    const fixture = await makeObjectiveHierarchy(testDb);
    const root = await insertObjectiveRow(testDb, {
      organizationId: fixture.organizationId,
      teamId: fixture.rootTeamId,
      title: "Root inherited",
    });
    const localTeam = await insertObjectiveRow(testDb, {
      organizationId: fixture.organizationId,
      teamId: fixture.childTeamId,
      title: "Child local",
    });

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      resolveEffectiveObjectivesForTeam(tx, fixture.actor, fixture.childTeamId),
    );

    expect(result.inherited.map((o) => [o.id, o.isInherited])).toEqual([[root, true]]);
    expect(result.local.map((o) => [o.id, o.isInherited])).toEqual([[localTeam, false]]);
  });

  it("does not include a person's directly-assigned objectives (bare team scope has no associated user)", async () => {
    const fixture = await makeObjectiveHierarchy(testDb);
    await insertObjectiveRow(testDb, {
      organizationId: fixture.organizationId,
      userId: fixture.userId,
      title: "Personal objective",
    });

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      resolveEffectiveObjectivesForTeam(tx, fixture.actor, fixture.childTeamId),
    );

    expect(result.local).toEqual([]);
    expect(result.inherited).toEqual([]);
  });

  it("returns empty layers for a nonexistent team id", async () => {
    const fixture = await makeObjectiveFixtureOrg(testDb);

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      resolveEffectiveObjectivesForTeam(tx, fixture.actor, randomUUID()),
    );

    expect(result).toEqual({ inherited: [], local: [] });
  });

  it("rejects a cross-organization team id with empty layers, not another org's data", async () => {
    const fixture = await makeObjectiveFixtureOrg(testDb);
    const otherOrg = await makeObjectiveFixtureOrg(testDb);

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      resolveEffectiveObjectivesForTeam(tx, fixture.actor, otherOrg.teamId),
    );

    expect(result).toEqual({ inherited: [], local: [] });
  });
});
