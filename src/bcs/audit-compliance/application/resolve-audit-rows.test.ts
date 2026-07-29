import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import * as identityAccess from "@/bcs/identity-access";
import type { AuditEvent } from "../domain/audit-event";
import { resolveAuditRows } from "./resolve-audit-rows";

describe("resolveAuditRows", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  function makeEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
    return {
      id: randomUUID(),
      organizationId: null,
      actorUserId: null,
      actorApiKeyId: null,
      action: "team.updated",
      resourceType: "team",
      resourceId: null,
      before: null,
      after: null,
      transport: "web",
      sourceIp: null,
      createdAt: new Date(),
      ...overrides,
    };
  }

  it("resolves resource and actor names per row", async () => {
    const organizationId = randomUUID();
    const teamId = randomUUID();
    const adminId = randomUUID();
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
      values (${adminId}, ${organizationId}, ${teamId}, ${`admin-${randomUUID()}`}, 'Alice', ${`${randomUUID()}@example.com`}, 'admin', true)
    `);

    const events = [
      makeEvent({ resourceType: "team", resourceId: teamId, actorUserId: adminId }),
      makeEvent({ resourceType: "user", resourceId: null, actorUserId: null, actorApiKeyId: null, action: "audit.pruned" }),
    ];

    const rows = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      resolveAuditRows(tx, organizationId, adminId, events),
    );

    expect(rows[0]).toMatchObject({
      resourceDisplayName: "Root",
      resourceNameResolved: true,
      actor: { kind: "user", displayName: "Alice", subtitle: "admin" },
    });
    expect(rows[1]).toMatchObject({
      resourceDisplayName: "—",
      resourceNameResolved: false,
      actor: { kind: "system", displayName: "system" },
    });
  });

  it("dedupes repeated (resourceType, resourceId) and actor pairs into a single resolver call each", async () => {
    const organizationId = randomUUID();
    const adminId = randomUUID();
    const listUsersSpy = vi.spyOn(identityAccess, "listUsers");

    const events = [
      makeEvent({ resourceType: "user", resourceId: adminId, actorUserId: adminId }),
      makeEvent({ resourceType: "user", resourceId: adminId, actorUserId: adminId }),
      makeEvent({ resourceType: "user", resourceId: adminId, actorUserId: adminId }),
    ];

    await withTenantContext(testDb.appDb, organizationId, (tx) =>
      resolveAuditRows(tx, organizationId, adminId, events),
    );

    // One call to resolve the repeated resource name + one to resolve the
    // repeated actor name, not six (2 lookups * 3 rows).
    expect(listUsersSpy).toHaveBeenCalledTimes(2);
    listUsersSpy.mockRestore();
  });
});
