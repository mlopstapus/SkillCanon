import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { createTestObjective, makeObjectiveFixtureOrg } from "./objective-test-helpers";
import { listProjectObjectives } from "./list-project-objectives";


describe("listProjectObjectives", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("returns only active project objectives in creation order", async () => {
    const fixture = await makeObjectiveFixtureOrg(testDb);
    const first = await createTestObjective(testDb, fixture, {
      teamId: null,
      projectId: fixture.projectId,
      title: "First project",
    });
    const second = await createTestObjective(testDb, fixture, {
      teamId: fixture.teamId,
      projectId: fixture.projectId,
      title: "Combined project",
    });
    await createTestObjective(testDb, fixture, { teamId: fixture.teamId, projectId: null, title: "Team only" });

    const results = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      listProjectObjectives(tx, fixture.actor, fixture.projectId),
    );

    expect(results.map((objective) => objective.id)).toEqual([first.id, second.id]);
  });
});
