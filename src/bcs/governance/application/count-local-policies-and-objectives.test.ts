import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { countLocalPoliciesAndObjectives } from "./count-local-policies-and-objectives";
import {
  createObjectiveFixtureTeam,
  createObjectiveFixtureUser,
  insertObjectiveRow,
  makeObjectiveFixtureOrg,
} from "./objective-test-helpers";
import {
  createPolicyFixtureTeam,
  insertPolicyRow,
  makePolicyFixtureOrg,
} from "./policy-test-helpers";

async function makeTeamPolicyFixture(testDb: TestDb) {
  const fixture = await makePolicyFixtureOrg(testDb);
  const parentTeamId = await createPolicyFixtureTeam(testDb, fixture, {
    parentTeamId: fixture.teamId,
    name: "Parent",
  });
  const childTeamId = await createPolicyFixtureTeam(testDb, fixture, {
    parentTeamId,
    name: "Child",
  });
  return { ...fixture, parentTeamId, childTeamId };
}

async function makeTeamObjectiveFixture(testDb: TestDb) {
  const fixture = await makeObjectiveFixtureOrg(testDb);
  const parentTeamId = await createObjectiveFixtureTeam(testDb, fixture, {
    parentTeamId: fixture.teamId,
    name: "Parent",
  });
  const childTeamId = await createObjectiveFixtureTeam(testDb, fixture, {
    parentTeamId,
    name: "Child",
  });
  const userId = await createObjectiveFixtureUser(testDb, fixture, childTeamId);
  return { ...fixture, actor: { organizationId: fixture.organizationId, userId }, parentTeamId, childTeamId, userId };
}

describe("countLocalPoliciesAndObjectives", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("counts active local policy and objective records for a team node", async () => {
    const policyFixture = await makeTeamPolicyFixture(testDb);
    await insertPolicyRow(testDb, {
      organizationId: policyFixture.organizationId,
      teamId: policyFixture.childTeamId,
      name: "Local policy 1",
    });
    await insertPolicyRow(testDb, {
      organizationId: policyFixture.organizationId,
      teamId: policyFixture.childTeamId,
      name: "Local policy 2",
    });
    await insertPolicyRow(testDb, {
      organizationId: policyFixture.organizationId,
      teamId: policyFixture.parentTeamId,
      name: "Inherited policy",
    });
    await insertPolicyRow(testDb, {
      organizationId: policyFixture.organizationId,
      projectId: policyFixture.projectId,
      name: "Project policy",
    });
    await insertPolicyRow(testDb, {
      organizationId: policyFixture.organizationId,
      teamId: policyFixture.childTeamId,
      name: "Inactive policy",
      isActive: false,
    });

    const result = await withTenantContext(testDb.appDb, policyFixture.organizationId, (tx) =>
      countLocalPoliciesAndObjectives(tx, policyFixture.actor, {
        type: "team",
        id: policyFixture.childTeamId,
      }),
    );

    expect(result).toEqual({ policyCount: 2, objectiveCount: 0, total: 2 });
  });

  it("counts active local objectives for a team node", async () => {
    const fixture = await makeTeamObjectiveFixture(testDb);
    await insertObjectiveRow(testDb, {
      organizationId: fixture.organizationId,
      teamId: fixture.childTeamId,
      title: "Local objective 1",
    });
    await insertObjectiveRow(testDb, {
      organizationId: fixture.organizationId,
      teamId: fixture.childTeamId,
      title: "Local objective 2",
    });
    await insertObjectiveRow(testDb, {
      organizationId: fixture.organizationId,
      teamId: fixture.parentTeamId,
      title: "Inherited objective",
    });
    await insertObjectiveRow(testDb, {
      organizationId: fixture.organizationId,
      projectId: fixture.projectId,
      title: "Project objective",
    });
    await insertObjectiveRow(testDb, {
      organizationId: fixture.organizationId,
      teamId: fixture.childTeamId,
      title: "Inactive objective",
      status: "paused",
    });

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      countLocalPoliciesAndObjectives(tx, fixture.actor, { type: "team", id: fixture.childTeamId }),
    );

    expect(result).toEqual({ policyCount: 0, objectiveCount: 2, total: 2 });
  });

  it("counts active user-personal objectives for a user node", async () => {
    const fixture = await makeTeamObjectiveFixture(testDb);
    await insertObjectiveRow(testDb, {
      organizationId: fixture.organizationId,
      userId: fixture.userId,
      title: "User objective",
    });
    await insertObjectiveRow(testDb, {
      organizationId: fixture.organizationId,
      teamId: fixture.childTeamId,
      title: "Team objective",
    });
    await insertObjectiveRow(testDb, {
      organizationId: fixture.organizationId,
      userId: fixture.userId,
      title: "Inactive user objective",
      status: "paused",
    });
    await insertObjectiveRow(testDb, {
      organizationId: randomUUID(),
      userId: fixture.userId,
      title: "Foreign user objective",
    });

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      countLocalPoliciesAndObjectives(tx, fixture.actor, { type: "user", id: fixture.userId }),
    );

    expect(result).toEqual({ policyCount: 0, objectiveCount: 1, total: 1 });
  });
});
