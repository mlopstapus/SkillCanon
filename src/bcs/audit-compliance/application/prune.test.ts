import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as recordModule from "./record";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { auditEvents } from "../infrastructure/schema";
import { pruneAuditEvents } from "./prune";

async function insertEvent(testDb: TestDb, overrides: Partial<typeof auditEvents.$inferInsert>) {
  const [row] = await testDb.ownerDb
    .insert(auditEvents)
    .values({
      organizationId: overrides.organizationId ?? randomUUID(),
      actorUserId: overrides.actorUserId ?? null,
      actorApiKeyId: overrides.actorApiKeyId ?? null,
      action: overrides.action ?? "user.updated",
      resourceType: overrides.resourceType ?? "user",
      resourceId: overrides.resourceId ?? randomUUID(),
      before: overrides.before ?? null,
      after: overrides.after ?? null,
      transport: overrides.transport ?? "web",
      sourceIp: overrides.sourceIp ?? null,
      createdAt: overrides.createdAt ?? new Date(),
    })
    .returning();
  if (!row) throw new Error("fixture insert failed");
  return row;
}

async function eventsFor(testDb: TestDb, organizationId: string) {
  const result = await testDb.appDb.execute<{
    id: string;
    action: string;
    after: { deleted?: number } | null;
    transport: string;
  }>(sql`select id, action, after, transport from audit.audit_events where organization_id = ${organizationId} order by created_at, id`);
  return Array.from(result);
}

describe("pruneAuditEvents", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("deletes old rows for one org and writes one audit.pruned row", async () => {
    const orgA = randomUUID();
    const orgB = randomUUID();
    await insertEvent(testDb, { organizationId: orgA, action: "old-a", createdAt: new Date("2026-07-01T00:00:00Z") });
    const kept = await insertEvent(testDb, { organizationId: orgA, action: "new-a", createdAt: new Date("2026-07-24T00:00:00Z") });
    const otherOld = await insertEvent(testDb, { organizationId: orgB, action: "old-b", createdAt: new Date("2026-07-01T00:00:00Z") });

    const result = await pruneAuditEvents(testDb.appDb, orgA, { now: new Date("2026-07-25T00:00:00Z") });
    const orgARows = await eventsFor(testDb, orgA);
    const orgBRows = await eventsFor(testDb, orgB);

    expect(result).toEqual({ deleted: 1, retentionDays: 7 });
    expect(orgARows.map((row) => row.id)).toContain(kept.id);
    expect(orgARows.map((row) => row.action)).toEqual(["new-a", "audit.pruned"]);
    const pruneRow = orgARows.find((row) => row.action === "audit.pruned");
    expect(pruneRow?.after).toMatchObject({ deleted: 1 });
    expect(pruneRow?.transport).toBe("system");
    expect(orgBRows.map((row) => row.id)).toEqual([otherOld.id]);
  });

  it("records a zero-delete pruning run", async () => {
    const org = randomUUID();
    await insertEvent(testDb, { organizationId: org, action: "new", createdAt: new Date("2026-07-24T00:00:00Z") });

    const result = await pruneAuditEvents(testDb.appDb, org, { now: new Date("2026-07-25T00:00:00Z") });
    const rows = await eventsFor(testDb, org);

    expect(result.deleted).toBe(0);
    expect(rows.filter((row) => row.action === "audit.pruned")).toHaveLength(1);
    expect(rows.find((row) => row.action === "audit.pruned")?.after).toMatchObject({ deleted: 0 });
  });

  it("rolls back deletion if the prune audit record fails", async () => {
    const org = randomUUID();
    const old = await insertEvent(testDb, { organizationId: org, action: "old", createdAt: new Date("2026-07-01T00:00:00Z") });
    vi.spyOn(recordModule, "record").mockRejectedValueOnce(new Error("audit write failed"));

    await expect(
      pruneAuditEvents(testDb.appDb, org, { now: new Date("2026-07-25T00:00:00Z") }),
    ).rejects.toThrow("audit write failed");

    const rows = await eventsFor(testDb, org);
    expect(rows.map((row) => row.id)).toEqual([old.id]);
    vi.restoreAllMocks();
  });
});
