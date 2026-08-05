import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { resolveEffectivePoliciesForTeam } from "./resolve-effective-policies-for-team";
import {
  createPolicyFixtureTeam,
  insertPolicyRow,
  makePolicyFixtureOrg,
} from "./policy-test-helpers";

async function makePolicyHierarchy(testDb: TestDb) {
  const fixture = await makePolicyFixtureOrg(testDb);
  const rootTeamId = fixture.teamId;
  const parentTeamId = await createPolicyFixtureTeam(testDb, fixture, {
    parentTeamId: rootTeamId,
    name: "Parent",
  });
  const childTeamId = await createPolicyFixtureTeam(testDb, fixture, {
    parentTeamId,
    name: "Child",
  });
  return { ...fixture, rootTeamId, parentTeamId, childTeamId };
}

describe("resolveEffectivePoliciesForTeam", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("splits inherited (ancestor teams) from local (the team itself) for a bare team scope", async () => {
    const fixture = await makePolicyHierarchy(testDb);
    const root = await insertPolicyRow(testDb, {
      organizationId: fixture.organizationId,
      teamId: fixture.rootTeamId,
      name: "Root inherited",
      priority: 10,
    });
    const parentHigh = await insertPolicyRow(testDb, {
      organizationId: fixture.organizationId,
      teamId: fixture.parentTeamId,
      name: "Parent inherited high",
      priority: 30,
    });
    const localTeam = await insertPolicyRow(testDb, {
      organizationId: fixture.organizationId,
      teamId: fixture.childTeamId,
      name: "Child local",
      priority: 20,
    });

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      resolveEffectivePoliciesForTeam(tx, fixture.actor, fixture.childTeamId),
    );

    expect(result.inherited.map((policy) => [policy.id, policy.isInherited])).toEqual([
      [parentHigh, true],
      [root, true],
    ]);
    expect(result.local.map((policy) => [policy.id, policy.isInherited])).toEqual([
      [localTeam, false],
    ]);
  });

  it("returns empty layers for a nonexistent team id", async () => {
    const fixture = await makePolicyFixtureOrg(testDb);

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      resolveEffectivePoliciesForTeam(tx, fixture.actor, randomUUID()),
    );

    expect(result).toEqual({ inherited: [], local: [] });
  });

  it("does not leak policies from another organization", async () => {
    const fixture = await makePolicyHierarchy(testDb);
    await insertPolicyRow(testDb, {
      organizationId: randomUUID(),
      teamId: fixture.parentTeamId,
      name: "Foreign org inherited",
      priority: 100,
    });

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      resolveEffectivePoliciesForTeam(tx, fixture.actor, fixture.childTeamId),
    );

    expect(result.inherited.some((policy) => policy.name === "Foreign org inherited")).toBe(false);
  });

  it("rejects a cross-organization team id with empty layers, not another org's data", async () => {
    const fixture = await makePolicyFixtureOrg(testDb);
    const otherOrg = await makePolicyFixtureOrg(testDb);

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      resolveEffectivePoliciesForTeam(tx, fixture.actor, otherOrg.teamId),
    );

    expect(result).toEqual({ inherited: [], local: [] });
  });
});
