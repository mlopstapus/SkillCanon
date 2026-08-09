import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { PolicyNotFoundError } from "../domain/policy";
import { createTestPolicy, makePolicyFixtureOrg, queryPolicyAuditEvents } from "./policy-test-helpers";
import { updatePolicy } from "./update-policy";

describe("updatePolicy", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("updates editable fields and records one audit event", async () => {
    const fixture = await makePolicyFixtureOrg(testDb);
    const created = await createTestPolicy(testDb, fixture, { description: "Before", priority: 1 });

    const updated = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      updatePolicy(
        tx,
        fixture.actor,
        created.id,
        {
          name: "Updated",
          description: "After",
          enforcementType: "append",
          content: "Append this.",
          priority: 20,
        },
        { transport: "cli", sourceIp: null },
      ),
    );

    expect(updated.name).toBe("Updated");
    expect(updated.description).toBe("After");
    expect(updated.enforcementType).toBe("append");
    expect(updated.content).toBe("Append this.");
    expect(updated.priority).toBe(20);
    expect(updated.teamId).toBe(created.teamId);

    const events = await queryPolicyAuditEvents(
      testDb,
      fixture.organizationId,
      sql`action = 'policy.updated' and resource_id = ${created.id}`,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.transport).toBe("cli");
  });

  it("rejects cross-organization updates as not found", async () => {
    const orgA = await makePolicyFixtureOrg(testDb);
    const orgB = await makePolicyFixtureOrg(testDb);
    const created = await createTestPolicy(testDb, orgB);

    await expect(
      withTenantContext(testDb.appDb, orgA.organizationId, (tx) =>
        updatePolicy(tx, orgA.actor, created.id, { name: "Nope" }),
      ),
    ).rejects.toThrow(PolicyNotFoundError);
  });
});
