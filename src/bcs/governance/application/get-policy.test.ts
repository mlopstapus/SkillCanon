import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { getPolicy } from "./get-policy";
import { createTestPolicy, makePolicyFixtureOrg } from "./policy-test-helpers";

describe("getPolicy", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("returns a policy in the actor organization", async () => {
    const fixture = await makePolicyFixtureOrg(testDb);
    const created = await createTestPolicy(testDb, fixture, { name: "Readable" });

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      getPolicy(tx, fixture.actor, created.id),
    );

    expect(result?.id).toBe(created.id);
    expect(result?.name).toBe("Readable");
  });

  it("treats a policy in another organization as not found", async () => {
    const orgA = await makePolicyFixtureOrg(testDb);
    const orgB = await makePolicyFixtureOrg(testDb);
    const created = await createTestPolicy(testDb, orgB);

    const result = await withTenantContext(testDb.appDb, orgA.organizationId, (tx) =>
      getPolicy(tx, orgA.actor, created.id),
    );

    expect(result).toBeUndefined();
  });
});
