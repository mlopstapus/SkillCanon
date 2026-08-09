import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { assertCrossTenantDenied } from "@/shared/testing/tenant-isolation";
import { record } from "./record";

/**
 * `audit.audit_events` (003-audit-compliance/004-audit-events-rls) — the one
 * confirmed exception to this repo's otherwise-universal RLS coverage until
 * now. Proves denial via the shared helper, matching every other bounded
 * context's own `tenant-isolation.test.ts`:
 *   1. through a raw, deliberately-unfiltered query, relying on RLS alone (M2)
 *   2. that skillcanon_auth's pre-auth write/read path (login()'s
 *      failed-login audit write, before any org is resolved) is unaffected —
 *      it keeps its existing permissive access via its own policy
 */
describe("audit-compliance tenant isolation (003-audit-compliance/004-audit-events-rls)", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("denies cross-organization read access by id via RLS alone", async () => {
    const orgA = randomUUID();
    const orgB = randomUUID();
    const resourceId = randomUUID();

    await withTenantContext(testDb.appDb, orgB, (tx) =>
      record(tx, {
        organizationId: orgB,
        actorUserId: null,
        actorApiKeyId: null,
        action: "test.action",
        resourceType: "test",
        resourceId,
        transport: "web",
      }),
    );

    const [row] = await withTenantContext(testDb.appDb, orgB, (tx) =>
      tx.execute(sql`select id from audit.audit_events where organization_id = ${orgB} and resource_id = ${resourceId}`),
    );
    const eventId = (row as { id: string }).id;

    await assertCrossTenantDenied({
      actingAsOrg: orgA,
      resourceOwnedByOrg: orgB,
      resourceId: eventId,
      fetchResourceById: (id) =>
        withTenantContext(testDb.appDb, orgA, async (tx) =>
          Array.from(await tx.execute(sql`select id from audit.audit_events where id = ${id}`)),
        ),
    });
  });

  it("denies an insert claiming a different organization than the session's tenant context", async () => {
    const orgA = randomUUID();
    const orgB = randomUUID();

    await expect(
      withTenantContext(testDb.appDb, orgA, (tx) =>
        record(tx, {
          organizationId: orgB,
          actorUserId: null,
          actorApiKeyId: null,
          action: "test.action",
          resourceType: "test",
          resourceId: randomUUID(),
          transport: "web",
        }),
      ),
    ).rejects.toThrow();

    const rowsUnderOrgB = await withTenantContext(testDb.appDb, orgB, (tx) =>
      tx.execute(sql`select id from audit.audit_events where organization_id = ${orgB}`),
    );
    expect(Array.from(rowsUnderOrgB)).toEqual([]);
  });

  it("leaves skillcanon_auth's pre-auth read/write path unaffected — sees every organization's rows and can write a null-organization row", async () => {
    const orgA = randomUUID();
    const resourceId = randomUUID();

    await withTenantContext(testDb.appDb, orgA, (tx) =>
      record(tx, {
        organizationId: orgA,
        actorUserId: null,
        actorApiKeyId: null,
        action: "test.action",
        resourceType: "test",
        resourceId,
        transport: "web",
      }),
    );

    // No tenant context needed — skillcanon_auth's policy is unconditionally permissive.
    const seenViaAuth = await testDb.authDb.execute(
      sql`select id from audit.audit_events where organization_id = ${orgA} and resource_id = ${resourceId}`,
    );
    expect(Array.from(seenViaAuth)).toHaveLength(1);

    const [nullOrgRow] = await testDb.authDb.execute(sql`
      insert into audit.audit_events (organization_id, action, resource_type, transport)
      values (null, 'user.login_failed', 'user', 'web')
      returning id
    `);
    expect((nullOrgRow as { id: string }).id).toBeTruthy();
  });
});
