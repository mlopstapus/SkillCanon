import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { createTestObjective, makeObjectiveFixtureOrg } from "./objective-test-helpers";
import { getObjective } from "./get-objective";

describe("getObjective", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("returns an objective in the actor organization", async () => {
    const fixture = await makeObjectiveFixtureOrg(testDb);
    const created = await createTestObjective(testDb, fixture, { title: "Find me" });

    const found = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      getObjective(tx, fixture.actor, created.id),
    );

    expect(found?.id).toBe(created.id);
    expect(found?.title).toBe("Find me");
  });

  it("does not return objectives from another organization", async () => {
    const orgA = await makeObjectiveFixtureOrg(testDb);
    const orgB = await makeObjectiveFixtureOrg(testDb);
    const created = await createTestObjective(testDb, orgB);

    const found = await withTenantContext(testDb.appDb, orgA.organizationId, (tx) =>
      getObjective(tx, orgA.actor, created.id),
    );

    expect(found).toBeNull();
  });
});
