import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { countLocalPoliciesAndObjectives } from "./count-local-policies-and-objectives";
import { resolveAllPolicies } from "./resolve-all-policies";
import { resolveEffectivePolicies } from "./resolve-effective-policies";
import {
  createPolicyFixtureTeam,
  createPolicyFixtureUser,
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
  const userId = await createPolicyFixtureUser(testDb, fixture, childTeamId);
  const actor = { organizationId: fixture.organizationId, userId };
  return { ...fixture, actor, rootTeamId, parentTeamId, childTeamId, userId };
}

describe("resolveEffectivePolicies", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("matches legacy inherited/local policy resolution across team and project scopes", async () => {
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
    await insertPolicyRow(testDb, {
      organizationId: fixture.organizationId,
      teamId: fixture.parentTeamId,
      name: "Inactive inherited",
      priority: 100,
      isActive: false,
    });
    const localTeam = await insertPolicyRow(testDb, {
      organizationId: fixture.organizationId,
      teamId: fixture.childTeamId,
      name: "Child local",
      priority: 20,
    });
    const localProject = await insertPolicyRow(testDb, {
      organizationId: fixture.organizationId,
      projectId: fixture.projectId,
      name: "Project local",
      priority: 40,
    });

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      resolveEffectivePolicies(tx, fixture.actor, fixture.userId, fixture.projectId),
    );

    expect(result.inherited.map((policy) => [policy.id, policy.isInherited])).toEqual([
      [parentHigh, true],
      [root, true],
    ]);
    expect(result.local.map((policy) => [policy.id, policy.isInherited])).toEqual([
      [localProject, false],
      [localTeam, false],
    ]);
  });

  it("returns empty layers when the target user is missing", async () => {
    const fixture = await makePolicyFixtureOrg(testDb);

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      resolveEffectivePolicies(tx, fixture.actor, randomUUID()),
    );

    expect(result).toEqual({ inherited: [], local: [] });
  });

  it("reads fresh policy state on every call", async () => {
    const fixture = await makePolicyHierarchy(testDb);

    const before = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      resolveEffectivePolicies(tx, fixture.actor, fixture.userId),
    );
    expect(before.local).toHaveLength(0);

    const fresh = await insertPolicyRow(testDb, {
      organizationId: fixture.organizationId,
      teamId: fixture.childTeamId,
      name: "Fresh local",
      priority: 5,
    });

    const after = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      resolveEffectivePolicies(tx, fixture.actor, fixture.userId),
    );
    expect(after.local.map((policy) => policy.id)).toEqual([fresh]);
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
      resolveEffectivePolicies(tx, fixture.actor, fixture.userId),
    );

    expect(result).toEqual({ inherited: [], local: [] });
  });
});

describe("resolveAllPolicies", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("matches legacy priority ordering with inherited policies winning ties", async () => {
    const fixture = await makePolicyHierarchy(testDb);
    const inheritedTie = await insertPolicyRow(testDb, {
      organizationId: fixture.organizationId,
      teamId: fixture.parentTeamId,
      name: "Inherited tie",
      priority: 50,
    });
    const localTie = await insertPolicyRow(testDb, {
      organizationId: fixture.organizationId,
      teamId: fixture.childTeamId,
      name: "Local tie",
      priority: 50,
    });
    const localHigh = await insertPolicyRow(testDb, {
      organizationId: fixture.organizationId,
      projectId: fixture.projectId,
      name: "Local high",
      priority: 100,
    });
    const inheritedLow = await insertPolicyRow(testDb, {
      organizationId: fixture.organizationId,
      teamId: fixture.rootTeamId,
      name: "Inherited low",
      priority: 1,
    });

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      resolveAllPolicies(tx, fixture.actor, fixture.userId, fixture.projectId),
    );

    expect(result.map((policy) => [policy.id, policy.isInherited])).toEqual([
      [localHigh, false],
      [inheritedTie, true],
      [localTie, false],
      [inheritedLow, true],
    ]);
  });
});

describe("countLocalPoliciesAndObjectives", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("counts only active local Governance records for a team node", async () => {
    const fixture = await makePolicyHierarchy(testDb);
    await insertPolicyRow(testDb, {
      organizationId: fixture.organizationId,
      teamId: fixture.childTeamId,
      name: "Local policy 1",
    });
    await insertPolicyRow(testDb, {
      organizationId: fixture.organizationId,
      teamId: fixture.childTeamId,
      name: "Local policy 2",
    });
    await insertPolicyRow(testDb, {
      organizationId: fixture.organizationId,
      teamId: fixture.parentTeamId,
      name: "Inherited policy",
    });
    await insertPolicyRow(testDb, {
      organizationId: fixture.organizationId,
      projectId: fixture.projectId,
      name: "Project policy",
    });
    await insertPolicyRow(testDb, {
      organizationId: fixture.organizationId,
      teamId: fixture.childTeamId,
      name: "Inactive policy",
      isActive: false,
    });

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      countLocalPoliciesAndObjectives(tx, fixture.actor, { type: "team", id: fixture.childTeamId }),
    );

    expect(result).toEqual({ policyCount: 2, objectiveCount: 0, total: 2 });
  });
});
