import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { countLocalPoliciesAndObjectives } from "./count-local-policies-and-objectives";
import { resolveAllObjectives } from "./resolve-all-objectives";
import { resolveEffectiveObjectives } from "./resolve-effective-objectives";
import {
  createObjectiveFixtureTeam,
  createObjectiveFixtureUser,
  insertObjectiveRow,
  makeObjectiveFixtureOrg,
} from "./objective-test-helpers";

const at = (day: number) => new Date(`2026-01-${String(day).padStart(2, "0")}T00:00:00Z`);

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
  const userId = await createObjectiveFixtureUser(testDb, fixture, childTeamId);
  const actor = { organizationId: fixture.organizationId, userId };
  return { ...fixture, actor, rootTeamId, parentTeamId, childTeamId, userId };
}

describe("resolveEffectiveObjectives", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("matches legacy objective inherited/local grouping and ordering", async () => {
    const fixture = await makeObjectiveHierarchy(testDb);
    const root = await insertObjectiveRow(testDb, {
      organizationId: fixture.organizationId,
      teamId: fixture.rootTeamId,
      title: "Root inherited",
      createdAt: at(1),
    });
    const parent = await insertObjectiveRow(testDb, {
      organizationId: fixture.organizationId,
      teamId: fixture.parentTeamId,
      title: "Parent inherited",
      createdAt: at(2),
    });
    const localTeam = await insertObjectiveRow(testDb, {
      organizationId: fixture.organizationId,
      teamId: fixture.childTeamId,
      title: "Child local",
      createdAt: at(3),
    });
    const userPersonal = await insertObjectiveRow(testDb, {
      organizationId: fixture.organizationId,
      userId: fixture.userId,
      title: "User personal",
      createdAt: at(4),
    });
    const project = await insertObjectiveRow(testDb, {
      organizationId: fixture.organizationId,
      projectId: fixture.projectId,
      title: "Project local",
      createdAt: at(5),
    });
    await insertObjectiveRow(testDb, {
      organizationId: fixture.organizationId,
      teamId: fixture.parentTeamId,
      title: "Inactive inherited",
      status: "archived",
      createdAt: at(6),
    });

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      resolveEffectiveObjectives(tx, fixture.actor, fixture.userId, fixture.projectId),
    );

    expect(result.inherited.map((objective) => [objective.id, objective.isInherited])).toEqual([
      [parent, true],
      [root, true],
    ]);
    expect(result.local.map((objective) => [objective.id, objective.isInherited])).toEqual([
      [localTeam, false],
      [userPersonal, false],
      [project, false],
    ]);
  });

  it("keeps parent objective links as metadata instead of recursively including children", async () => {
    const fixture = await makeObjectiveHierarchy(testDb);
    const parentObjective = await insertObjectiveRow(testDb, {
      organizationId: fixture.organizationId,
      teamId: fixture.parentTeamId,
      title: "Inherited parent",
      createdAt: at(1),
    });
    const siblingTeamId = await createObjectiveFixtureTeam(testDb, fixture, {
      parentTeamId: fixture.rootTeamId,
      name: "Sibling",
    });
    await insertObjectiveRow(testDb, {
      organizationId: fixture.organizationId,
      teamId: siblingTeamId,
      title: "Linked child outside user chain",
      parentObjectiveId: parentObjective,
      createdAt: at(2),
    });

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      resolveEffectiveObjectives(tx, fixture.actor, fixture.userId),
    );

    expect(result.inherited.map((objective) => objective.id)).toEqual([parentObjective]);
  });

  it("returns empty layers when the target user is missing", async () => {
    const fixture = await makeObjectiveFixtureOrg(testDb);

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      resolveEffectiveObjectives(tx, fixture.actor, randomUUID()),
    );

    expect(result).toEqual({ inherited: [], local: [] });
  });

  it("reads fresh objective state on every call", async () => {
    const fixture = await makeObjectiveHierarchy(testDb);

    const before = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      resolveEffectiveObjectives(tx, fixture.actor, fixture.userId),
    );
    expect(before.local).toHaveLength(0);

    const fresh = await insertObjectiveRow(testDb, {
      organizationId: fixture.organizationId,
      teamId: fixture.childTeamId,
      title: "Fresh objective",
      createdAt: at(1),
    });

    const after = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      resolveEffectiveObjectives(tx, fixture.actor, fixture.userId),
    );
    expect(after.local.map((objective) => objective.id)).toEqual([fresh]);
  });

  it("does not leak objectives from another organization", async () => {
    const fixture = await makeObjectiveHierarchy(testDb);
    await insertObjectiveRow(testDb, {
      organizationId: randomUUID(),
      teamId: fixture.parentTeamId,
      title: "Foreign objective",
      createdAt: at(1),
    });

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      resolveEffectiveObjectives(tx, fixture.actor, fixture.userId),
    );

    expect(result).toEqual({ inherited: [], local: [] });
  });
});

describe("resolveAllObjectives", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("returns inherited objective titles before local objective titles", async () => {
    const fixture = await makeObjectiveHierarchy(testDb);
    await insertObjectiveRow(testDb, {
      organizationId: fixture.organizationId,
      teamId: fixture.parentTeamId,
      title: "Inherited title",
      createdAt: at(1),
    });
    await insertObjectiveRow(testDb, {
      organizationId: fixture.organizationId,
      teamId: fixture.childTeamId,
      title: "Local title",
      createdAt: at(2),
    });
    await insertObjectiveRow(testDb, {
      organizationId: fixture.organizationId,
      userId: fixture.userId,
      title: "User title",
      createdAt: at(3),
    });

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      resolveAllObjectives(tx, fixture.actor, fixture.userId),
    );

    expect(result).toEqual(["Inherited title", "Local title", "User title"]);
  });
});

describe("countLocalPoliciesAndObjectives for objectives", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("counts only active local objectives for a team node", async () => {
    const fixture = await makeObjectiveHierarchy(testDb);
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

  it("counts user-personal active objectives for a user node", async () => {
    const fixture = await makeObjectiveHierarchy(testDb);
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
