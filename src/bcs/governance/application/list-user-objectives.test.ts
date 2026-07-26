import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { createTestObjective, makeObjectiveFixtureOrg } from "./objective-test-helpers";
import { listUserObjectives } from "./list-user-objectives";


describe("listUserObjectives", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("returns only active user objectives in creation order", async () => {
    const fixture = await makeObjectiveFixtureOrg(testDb);
    const first = await createTestObjective(testDb, fixture, {
      teamId: null,
      userId: fixture.userId,
      title: "First user",
    });
    const second = await createTestObjective(testDb, fixture, {
      teamId: fixture.teamId,
      userId: fixture.userId,
      title: "Combined user",
    });
    await createTestObjective(testDb, fixture, { teamId: fixture.teamId, title: "Team only" });

    const results = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      listUserObjectives(tx, fixture.actor, fixture.userId),
    );

    expect(results.map((objective) => objective.id)).toEqual([first.id, second.id]);
  });
});
