import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { ObjectiveNotFoundError } from "../domain/objective";
import {
  createTestObjective,
  makeObjectiveFixtureOrg,
  queryObjectiveAuditEvents,
  queryObjectiveRows,
} from "./objective-test-helpers";
import { deleteObjective } from "./delete-objective";

describe("deleteObjective", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("hard-deletes an objective and records one audit event", async () => {
    const fixture = await makeObjectiveFixtureOrg(testDb);
    const created = await createTestObjective(testDb, fixture);

    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      deleteObjective(tx, fixture.actor, created.id, { transport: "api", sourceIp: "203.0.113.5" }),
    );

    const rows = await queryObjectiveRows(testDb, sql`id = ${created.id}`);
    expect(rows).toHaveLength(0);
    const events = await queryObjectiveAuditEvents(
      testDb,
      fixture.organizationId,
      sql`action = 'objective.deleted' and resource_id = ${created.id}`,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.transport).toBe("api");
    expect(events[0]?.source_ip).toBe("203.0.113.5");
  });

  it("rejects cross-organization deletes as not found without auditing", async () => {
    const orgA = await makeObjectiveFixtureOrg(testDb);
    const orgB = await makeObjectiveFixtureOrg(testDb);
    const created = await createTestObjective(testDb, orgB);
    const eventsBefore = await queryObjectiveAuditEvents(testDb, orgB.organizationId, sql`action = 'objective.deleted'`);

    await expect(
      withTenantContext(testDb.appDb, orgA.organizationId, (tx) =>
        deleteObjective(tx, orgA.actor, created.id),
      ),
    ).rejects.toThrow(ObjectiveNotFoundError);

    const rows = await queryObjectiveRows(testDb, sql`id = ${created.id}`);
    expect(rows).toHaveLength(1);
    const eventsAfter = await queryObjectiveAuditEvents(testDb, orgB.organizationId, sql`action = 'objective.deleted'`);
    expect(eventsAfter).toHaveLength(eventsBefore.length);
  });
});
