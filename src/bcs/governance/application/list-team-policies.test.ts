import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { deletePolicy } from "./delete-policy";
import { listTeamPolicies } from "./list-team-policies";
import { createTestPolicy, makePolicyFixtureOrg } from "./policy-test-helpers";

describe("listTeamPolicies", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("returns only active team policies ordered by priority descending", async () => {
    const fixture = await makePolicyFixtureOrg(testDb);
    const low = await createTestPolicy(testDb, fixture, { name: "Low", priority: 1 });
    const high = await createTestPolicy(testDb, fixture, { name: "High", priority: 100 });
    const inactive = await createTestPolicy(testDb, fixture, { name: "Inactive", priority: 200 });
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      deletePolicy(tx, fixture.actor, inactive.id),
    );

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      listTeamPolicies(tx, fixture.actor, fixture.teamId),
    );

    expect(result.map((policy) => policy.id)).toEqual([high.id, low.id]);
  });

  it("does not return policies from another organization", async () => {
    const orgA = await makePolicyFixtureOrg(testDb);
    const orgB = await makePolicyFixtureOrg(testDb);
    await testDb.ownerDb.execute(sql`
      insert into governance.policies
        (id, organization_id, team_id, project_id, name, enforcement_type, content, priority, is_active)
      values
        (${randomUUID()}, ${orgB.organizationId}, ${orgA.teamId}, null, 'Wrong org', 'prepend', 'Ignore me.', 50, true)
    `);

    const result = await withTenantContext(testDb.appDb, orgA.organizationId, (tx) =>
      listTeamPolicies(tx, orgA.actor, orgA.teamId),
    );

    expect(result).toEqual([]);
  });
});
