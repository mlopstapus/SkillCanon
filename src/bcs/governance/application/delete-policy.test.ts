import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { PolicyNotFoundError } from "../domain/policy";
import { deletePolicy } from "./delete-policy";
import {
  createTestPolicy,
  makePolicyFixtureOrg,
  queryPolicyAuditEvents,
  queryPolicyRows,
} from "./policy-test-helpers";

describe("deletePolicy", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("soft-deactivates a policy and records one audit event", async () => {
    const fixture = await makePolicyFixtureOrg(testDb);
    const created = await createTestPolicy(testDb, fixture);

    const changed = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      deletePolicy(tx, fixture.actor, created.id, { transport: "web", sourceIp: "203.0.113.7" }),
    );

    expect(changed).toBe(true);
    const rows = await queryPolicyRows(testDb, sql`id = ${created.id}`);
    expect(rows[0]?.is_active).toBe(false);
    const events = await queryPolicyAuditEvents(
      testDb,
      fixture.organizationId,
      sql`action = 'policy.deactivated' and resource_id = ${created.id}`,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.source_ip).toBe("203.0.113.7");
  });

  it("is a no-op for an already inactive policy", async () => {
    const fixture = await makePolicyFixtureOrg(testDb);
    const created = await createTestPolicy(testDb, fixture);

    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      deletePolicy(tx, fixture.actor, created.id),
    );
    const second = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      deletePolicy(tx, fixture.actor, created.id),
    );

    expect(second).toBe(false);
    const events = await queryPolicyAuditEvents(
      testDb,
      fixture.organizationId,
      sql`action = 'policy.deactivated' and resource_id = ${created.id}`,
    );
    expect(events).toHaveLength(1);
  });

  it("rejects cross-organization deletes as not found", async () => {
    const orgA = await makePolicyFixtureOrg(testDb);
    const orgB = await makePolicyFixtureOrg(testDb);
    const created = await createTestPolicy(testDb, orgB);

    await expect(
      withTenantContext(testDb.appDb, orgA.organizationId, (tx) =>
        deletePolicy(tx, orgA.actor, created.id),
      ),
    ).rejects.toThrow(PolicyNotFoundError);
  });
});
