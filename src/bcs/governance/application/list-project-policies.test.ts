import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { deletePolicy } from "./delete-policy";
import { listProjectPolicies } from "./list-project-policies";
import { createTestPolicy, makePolicyFixtureOrg } from "./policy-test-helpers";

describe("listProjectPolicies", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("returns only active project policies ordered by priority descending", async () => {
    const fixture = await makePolicyFixtureOrg(testDb);
    const low = await createTestPolicy(testDb, fixture, {
      teamId: null,
      projectId: fixture.projectId,
      name: "Low",
      priority: 1,
    });
    const high = await createTestPolicy(testDb, fixture, {
      teamId: null,
      projectId: fixture.projectId,
      name: "High",
      priority: 100,
    });
    const inactive = await createTestPolicy(testDb, fixture, {
      teamId: null,
      projectId: fixture.projectId,
      name: "Inactive",
      priority: 200,
    });
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      deletePolicy(tx, fixture.actor, inactive.id),
    );

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      listProjectPolicies(tx, fixture.actor, fixture.projectId),
    );

    expect(result.map((policy) => policy.id)).toEqual([high.id, low.id]);
  });

  it("returns an empty list when no active project policies exist", async () => {
    const fixture = await makePolicyFixtureOrg(testDb);

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      listProjectPolicies(tx, fixture.actor, fixture.projectId),
    );

    expect(result).toEqual([]);
  });
});
