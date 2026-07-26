import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { auditEvents } from "./schema";
import { countByOrganization, deleteOlderThan, insert, queryByOrganization } from "./audit-events-repo";

async function insertEvent(
  testDb: TestDb,
  overrides: Partial<typeof auditEvents.$inferInsert> = {},
) {
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

describe("audit-events-repo", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("inserts a complete audit event with transport metadata", async () => {
    const organizationId = randomUUID();
    const actorUserId = randomUUID();
    const resourceId = randomUUID();

    const row = await insert(testDb.appDb, {
      organizationId,
      actorUserId,
      actorApiKeyId: null,
      action: "user.login",
      resourceType: "user",
      resourceId,
      before: null,
      after: null,
      transport: "web",
      sourceIp: "203.0.113.10",
    });

    expect(row.id).toBeTruthy();
    expect(row.organizationId).toBe(organizationId);
    expect(row.actorUserId).toBe(actorUserId);
    expect(row.action).toBe("user.login");
    expect(row.resourceType).toBe("user");
    expect(row.resourceId).toBe(resourceId);
    expect(row.transport).toBe("web");
    expect(row.sourceIp).toBe("203.0.113.10");
    expect(row.createdAt).toBeTruthy();
  });

  it("inserts unknown-organization audit events", async () => {
    const row = await insert(testDb.appDb, {
      organizationId: null,
      actorUserId: null,
      actorApiKeyId: null,
      action: "user.login_failed",
      resourceType: "user",
      resourceId: null,
      before: null,
      after: null,
      transport: "web",
      sourceIp: null,
    });

    expect(row.id).toBeTruthy();
    expect(row.organizationId).toBeNull();
    expect(row.actorUserId).toBeNull();
    expect(row.resourceId).toBeNull();
    expect(row.transport).toBe("web");
    expect(row.sourceIp).toBeNull();
  });

  it("queries one organization in newest-first pages and counts the same scope", async () => {
    const orgA = randomUUID();
    const orgB = randomUUID();
    const old = await insertEvent(testDb, {
      organizationId: orgA,
      action: "old",
      createdAt: new Date("2026-07-20T00:00:00Z"),
    });
    const newest = await insertEvent(testDb, {
      organizationId: orgA,
      action: "newest",
      createdAt: new Date("2026-07-22T00:00:00Z"),
    });
    await insertEvent(testDb, {
      organizationId: orgB,
      action: "other-org",
      createdAt: new Date("2026-07-23T00:00:00Z"),
    });

    const filters = { retentionCutoff: new Date("2026-07-19T00:00:00Z"), limit: 1, offset: 0 };
    const rows = await queryByOrganization(testDb.appDb, orgA, filters);
    const count = await countByOrganization(testDb.appDb, orgA, filters);

    expect(rows.map((row) => row.id)).toEqual([newest.id]);
    expect(count).toBe(2);
    expect(old.organizationId).toBe(orgA);
  });

  it("excludes rows older than the retention cutoff", async () => {
    const org = randomUUID();
    await insertEvent(testDb, {
      organizationId: org,
      action: "too-old",
      createdAt: new Date("2026-07-01T00:00:00Z"),
    });
    const retained = await insertEvent(testDb, {
      organizationId: org,
      action: "retained",
      createdAt: new Date("2026-07-24T00:00:00Z"),
    });

    const rows = await queryByOrganization(testDb.appDb, org, {
      retentionCutoff: new Date("2026-07-20T00:00:00Z"),
    });

    expect(rows.map((row) => row.id)).toEqual([retained.id]);
  });

  it("applies search, resource, actor, transport, and date filters together", async () => {
    const org = randomUUID();
    const actorUserId = randomUUID();
    const actorApiKeyId = randomUUID();
    const matching = await insertEvent(testDb, {
      organizationId: org,
      actorUserId,
      actorApiKeyId,
      action: "policy.updated",
      resourceType: "policy",
      resourceId: randomUUID(),
      transport: "web",
      createdAt: new Date("2026-07-24T12:00:00Z"),
    });
    await insertEvent(testDb, {
      organizationId: org,
      actorUserId,
      action: "policy.updated",
      resourceType: "policy",
      transport: "api",
      createdAt: new Date("2026-07-24T12:00:00Z"),
    });
    await insertEvent(testDb, {
      organizationId: org,
      actorUserId: randomUUID(),
      action: "policy.updated",
      resourceType: "policy",
      transport: "web",
      createdAt: new Date("2026-07-24T12:00:00Z"),
    });

    const rows = await queryByOrganization(testDb.appDb, org, {
      retentionCutoff: new Date("2026-07-20T00:00:00Z"),
      search: "POLICY",
      resourceType: "policy",
      actorUserId,
      actorApiKeyId,
      transport: "web",
      createdAtFrom: new Date("2026-07-24T00:00:00Z"),
      createdAtTo: new Date("2026-07-25T00:00:00Z"),
    });

    expect(rows.map((row) => row.id)).toEqual([matching.id]);
  });

  it("matches search against supplied actor user ids", async () => {
    const org = randomUUID();
    const actorUserId = randomUUID();
    const matching = await insertEvent(testDb, { organizationId: org, actorUserId, action: "team.created" });
    await insertEvent(testDb, { organizationId: org, actorUserId: randomUUID(), action: "team.created" });

    const rows = await queryByOrganization(testDb.appDb, org, {
      retentionCutoff: new Date("2026-07-20T00:00:00Z"),
      search: "alice",
      actorUserIds: [actorUserId],
    });

    expect(rows.map((row) => row.id)).toEqual([matching.id]);
  });

  it("deletes only one organization's rows older than the cutoff", async () => {
    const orgA = randomUUID();
    const orgB = randomUUID();
    await insertEvent(testDb, {
      organizationId: orgA,
      action: "delete-me",
      createdAt: new Date("2026-07-01T00:00:00Z"),
    });
    const retained = await insertEvent(testDb, {
      organizationId: orgA,
      action: "keep-me",
      createdAt: new Date("2026-07-24T00:00:00Z"),
    });
    const otherOrgOld = await insertEvent(testDb, {
      organizationId: orgB,
      action: "other-old",
      createdAt: new Date("2026-07-01T00:00:00Z"),
    });

    const deleted = await deleteOlderThan(testDb.appDb, orgA, new Date("2026-07-20T00:00:00Z"));
    const remainingA = await queryByOrganization(testDb.appDb, orgA, {
      retentionCutoff: new Date("2026-01-01T00:00:00Z"),
    });
    const remainingB = await queryByOrganization(testDb.appDb, orgB, {
      retentionCutoff: new Date("2026-01-01T00:00:00Z"),
    });

    expect(deleted).toBe(1);
    expect(remainingA.map((row) => row.id)).toEqual([retained.id]);
    expect(remainingB.map((row) => row.id)).toEqual([otherOrgOld.id]);
  });
});
