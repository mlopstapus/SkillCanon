import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { createTestObjective, makeObjectiveFixtureOrg } from "./objective-test-helpers";
import { listTeamObjectives } from "./list-team-objectives";
import { updateObjective } from "./update-objective";

describe("listTeamObjectives", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("returns only active objectives for the actor organization and team ordered by creation", async () => {
    const orgA = await makeObjectiveFixtureOrg(testDb);
    const orgB = await makeObjectiveFixtureOrg(testDb);
    const first = await createTestObjective(testDb, orgA, { title: "First" });
    const inactive = await createTestObjective(testDb, orgA, { title: "Inactive" });
    const second = await createTestObjective(testDb, orgA, { title: "Second" });
    await createTestObjective(testDb, orgB, { title: "Cross org" });
    await createTestObjective(testDb, orgA, { projectId: orgA.projectId, teamId: null, title: "Project only" });
    await withTenantContext(testDb.appDb, orgA.organizationId, (tx) =>
      updateObjective(tx, orgA.actor, inactive.id, { status: "inactive" }, { }),
    );

    const results = await withTenantContext(testDb.appDb, orgA.organizationId, (tx) =>
      listTeamObjectives(tx, orgA.actor, orgA.teamId),
    );

    expect(results.map((objective) => objective.id)).toEqual([first.id, second.id]);
  });
});
