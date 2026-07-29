import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { auditEvents } from "../infrastructure/schema";
import { listAuditActorOptions } from "./list-audit-actor-options";

describe("listAuditActorOptions", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("returns one option per distinct actor, including a system entry, resolved to a display name", async () => {
    const organizationId = randomUUID();
    const teamId = randomUUID();
    const adminId = randomUUID();
    const bobId = randomUUID();
    const orgSlug = `org-${randomUUID()}`;

    await testDb.ownerDb.execute(sql`
      insert into identity_access.organizations (id, name, slug)
      values (${organizationId}, ${`Org ${orgSlug}`}, ${orgSlug})
    `);
    await testDb.ownerDb.execute(sql`
      insert into identity_access.teams (id, organization_id, name, slug)
      values (${teamId}, ${organizationId}, 'Root', ${`team-${randomUUID()}`})
    `);
    await testDb.ownerDb.execute(sql`
      insert into identity_access.users (id, organization_id, team_id, username, display_name, email, role, is_active)
      values
        (${adminId}, ${organizationId}, ${teamId}, ${`admin-${randomUUID()}`}, 'Alice', ${`${randomUUID()}@example.com`}, 'admin', true),
        (${bobId}, ${organizationId}, ${teamId}, ${`bob-${randomUUID()}`}, 'Bob', ${`${randomUUID()}@example.com`}, 'member', true)
    `);

    await testDb.appDb.insert(auditEvents).values([
      {
        organizationId,
        actorUserId: adminId,
        actorApiKeyId: null,
        action: "team.updated",
        resourceType: "team",
        resourceId: teamId,
        transport: "web",
      },
      {
        organizationId,
        actorUserId: bobId,
        actorApiKeyId: null,
        action: "team.updated",
        resourceType: "team",
        resourceId: teamId,
        transport: "web",
      },
      {
        organizationId,
        actorUserId: null,
        actorApiKeyId: null,
        action: "audit.pruned",
        resourceType: "audit_event",
        resourceId: null,
        transport: "system",
      },
    ]);

    const options = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      listAuditActorOptions(tx, organizationId, adminId, new Date("2020-01-01T00:00:00Z")),
    );

    expect(options).toHaveLength(3);
    expect(options).toEqual(
      expect.arrayContaining([
        { actorUserId: adminId, actorApiKeyId: null, displayName: "Alice", subtitle: "admin" },
        { actorUserId: bobId, actorApiKeyId: null, displayName: "Bob", subtitle: "member" },
        { actorUserId: null, actorApiKeyId: null, displayName: "system", subtitle: "scheduled" },
      ]),
    );
  });
});
