import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withTenantContext } from "@/shared/db/tenant-context";
import { auditEvents } from "../infrastructure/schema";
import { listAuditEvents } from "./list";

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

async function makeUser(testDb: TestDb, displayName: string) {
  const organizationId = randomUUID();
  const teamId = randomUUID();
  const id = randomUUID();
  await testDb.ownerDb.execute(sql`
    insert into identity_access.organizations (id, name, slug)
    values (${organizationId}, ${`Org ${randomUUID()}`}, ${`org-${randomUUID()}`})
  `);
  await testDb.ownerDb.execute(sql`
    insert into identity_access.teams (id, organization_id, name, slug)
    values (${teamId}, ${organizationId}, 'Root', ${`root-${randomUUID()}`})
  `);
  await testDb.ownerDb.execute(sql`
    insert into identity_access.users (
      id, organization_id, team_id, username, display_name, email, password_hash, role
    ) values (
      ${id}, ${organizationId}, ${teamId}, ${`user-${randomUUID()}`}, ${displayName},
      ${`user-${randomUUID()}@example.com`}, 'hash', 'admin'
    )
  `);
  return { id, organizationId, teamId };
}

describe("listAuditEvents", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("returns a retained, tenant-scoped, newest-first page", async () => {
    const actor = await makeUser(testDb, "Admin User");
    const otherOrg = randomUUID();
    await insertEvent(testDb, { organizationId: actor.organizationId, action: "too-old", createdAt: new Date("2026-07-01T00:00:00Z") });
    const older = await insertEvent(testDb, { organizationId: actor.organizationId, action: "older", createdAt: new Date("2026-07-23T00:00:00Z") });
    const newer = await insertEvent(testDb, { organizationId: actor.organizationId, action: "newer", createdAt: new Date("2026-07-24T00:00:00Z") });
    await insertEvent(testDb, { organizationId: otherOrg, action: "other-org", createdAt: new Date("2026-07-25T00:00:00Z") });

    const result = await withTenantContext(testDb.appDb, actor.organizationId, (tx) =>
      listAuditEvents(
        tx,
        actor.organizationId,
        { page: 1, pageSize: 10 },
        { requestingUserId: actor.id, now: new Date("2026-07-25T00:00:00Z") },
      ),
    );

    expect(result.retentionDays).toBe(7);
    expect(result.total).toBe(2);
    expect(result.items.map((row) => row.id)).toEqual([newer.id, older.id]);
  });

  it("returns an empty page beyond the last available page", async () => {
    const actor = await makeUser(testDb, "Pager");
    await insertEvent(testDb, { organizationId: actor.organizationId, action: "one", createdAt: new Date("2026-07-24T00:00:00Z") });

    const result = await withTenantContext(testDb.appDb, actor.organizationId, (tx) =>
      listAuditEvents(
        tx,
        actor.organizationId,
        { page: 2, pageSize: 1 },
        { requestingUserId: actor.id, now: new Date("2026-07-25T00:00:00Z") },
      ),
    );

    expect(result.total).toBe(1);
    expect(result.items).toEqual([]);
  });

  it("narrows by each filter dimension in combination", async () => {
    const actor = await makeUser(testDb, "Policy Admin");
    const apiKeyId = randomUUID();
    const matching = await insertEvent(testDb, {
      organizationId: actor.organizationId,
      actorUserId: actor.id,
      actorApiKeyId: apiKeyId,
      action: "policy.updated",
      resourceType: "policy",
      resourceId: randomUUID(),
      transport: "web",
      createdAt: new Date("2026-07-24T12:00:00Z"),
    });
    await insertEvent(testDb, {
      organizationId: actor.organizationId,
      actorUserId: actor.id,
      actorApiKeyId: apiKeyId,
      action: "policy.updated",
      resourceType: "policy",
      transport: "api",
      createdAt: new Date("2026-07-24T12:00:00Z"),
    });

    const result = await withTenantContext(testDb.appDb, actor.organizationId, (tx) =>
      listAuditEvents(
        tx,
        actor.organizationId,
        {
          search: "policy",
          resourceType: "policy",
          actorUserId: actor.id,
          actorApiKeyId: apiKeyId,
          transport: "web",
          createdAtFrom: new Date("2026-07-24T00:00:00Z"),
          createdAtTo: new Date("2026-07-25T00:00:00Z"),
        },
        { requestingUserId: actor.id, now: new Date("2026-07-25T00:00:00Z") },
      ),
    );

    expect(result.items.map((row) => row.id)).toEqual([matching.id]);
  });

  it("matches free-text search against actor display name through identity-access", async () => {
    const alice = await makeUser(testDb, "Alice Compliance");
    const bob = await makeUser(testDb, "Bob Compliance");
    const matching = await insertEvent(testDb, {
      organizationId: alice.organizationId,
      actorUserId: alice.id,
      action: "team.created",
      createdAt: new Date("2026-07-24T00:00:00Z"),
    });
    await insertEvent(testDb, {
      organizationId: alice.organizationId,
      actorUserId: bob.id,
      action: "team.created",
      createdAt: new Date("2026-07-24T00:00:00Z"),
    });

    const result = await withTenantContext(testDb.appDb, alice.organizationId, (tx) =>
      listAuditEvents(
        tx,
        alice.organizationId,
        { search: "alice" },
        { requestingUserId: alice.id, now: new Date("2026-07-25T00:00:00Z") },
      ),
    );

    expect(result.items.map((row) => row.id)).toEqual([matching.id]);
  });
});
