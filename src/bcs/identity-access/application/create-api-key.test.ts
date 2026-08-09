import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withTenantContext } from "@/shared/db/tenant-context";
import { logger } from "@/shared/logging";
import type { UserSummary } from "../domain/user";
import {
  InvalidScopeError,
  NoScopesSelectedError,
  ScopeExceedsPermissionsError,
} from "../domain/api-key";
import { insert as insertOrg } from "../infrastructure/organizations-repo";
import { insert as insertTeam } from "../infrastructure/teams-repo";
import { insert as insertUser } from "../infrastructure/users-repo";
import { createApiKey } from "./create-api-key";

async function queryAuditEvents(testDb: TestDb, organizationId: string, whereSql: ReturnType<typeof sql>) {
  // Read via appDb, not authDb — skillcanon_auth has no grant on the audit
  // schema (011-tenant-isolation-rls scopes it to identity_access only);
  // skillcanon_app can already read every schema (0000_create_schemas.sql).
  // audit.audit_events is now RLS-protected for skillcanon_app
  // (003-audit-compliance/004-audit-events-rls) — the read must run inside
  // a tenant-context-scoped connection, same as any other org-scoped table.
  const result = await withTenantContext(testDb.appDb, organizationId, (tx) =>
    tx.execute<{
      action: string;
      resource_id: string | null;
      transport: string;
      source_ip: string | null;
    }>(sql`select action, resource_id, transport, source_ip from audit.audit_events where ${whereSql}`),
  );
  return Array.from(result);
}

async function makeUser(
  testDb: TestDb,
  role: "admin" | "member" = "member",
): Promise<UserSummary> {
  const { id: organizationId } = await insertOrg(testDb.authDb, {
    name: "Acme",
    slug: `acme-${randomUUID()}`,
  });
  const { id: teamId } = await insertTeam(testDb.authDb, {
    organizationId,
    name: "Root",
    slug: `root-${randomUUID()}`,
  });
  const email = `user-${randomUUID()}@example.com`;
  const { id } = await insertUser(testDb.authDb, {
    organizationId,
    teamId,
    username: `user-${randomUUID()}`,
    displayName: "User",
    email,
    passwordHash: "hash",
    role,
  });
  return { id, orgId: organizationId, teamId, role, email };
}

describe("createApiKey", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("allows an admin to create a key with any well-formed scope", async () => {
    const admin = await makeUser(testDb, "admin");

    const result = await withTenantContext(testDb.appDb, admin.orgId, (tx) =>
      createApiKey(tx, admin, { name: "CI job", scopes: ["prompts:write"] }),
    );

    expect(result.id).toBeTruthy();
    expect(result.rawKey.startsWith("sk_")).toBe(true);
  });

  it("allows a member to create a key with only :read scopes", async () => {
    const member = await makeUser(testDb, "member");

    const result = await withTenantContext(testDb.appDb, member.orgId, (tx) =>
      createApiKey(tx, member, { name: "My IDE", scopes: ["prompts:read"] }),
    );

    expect(result.id).toBeTruthy();
  });

  it("rejects a member requesting a :write scope", async () => {
    const member = await makeUser(testDb, "member");

    await expect(
      withTenantContext(testDb.appDb, member.orgId, (tx) =>
        createApiKey(tx, member, { name: "Too broad", scopes: ["prompts:write"] }),
      ),
    ).rejects.toThrow(ScopeExceedsPermissionsError);
  });

  it("rejects a member requesting a :run scope", async () => {
    const member = await makeUser(testDb, "member");

    await expect(
      withTenantContext(testDb.appDb, member.orgId, (tx) =>
        createApiKey(tx, member, { name: "Too broad", scopes: ["workflows:run"] }),
      ),
    ).rejects.toThrow(ScopeExceedsPermissionsError);
  });

  it("rejects creation with an empty scopes array", async () => {
    const admin = await makeUser(testDb, "admin");

    await expect(
      withTenantContext(testDb.appDb, admin.orgId, (tx) =>
        createApiKey(tx, admin, { name: "No scopes", scopes: [] }),
      ),
    ).rejects.toThrow(NoScopesSelectedError);
  });

  it.each(["bad", "Prompts:READ", "prompts:delete"])(
    "rejects a malformed scope string: %s",
    async (scope) => {
      const admin = await makeUser(testDb, "admin");

      await expect(
        withTenantContext(testDb.appDb, admin.orgId, (tx) =>
          createApiKey(tx, admin, { name: "Bad scope", scopes: [scope] }),
        ),
      ).rejects.toThrow(InvalidScopeError);
    },
  );

  it("stores only a SHA-256 hash and a 12-character prefix — never the raw key", async () => {
    const admin = await makeUser(testDb, "admin");

    const { id, rawKey } = await withTenantContext(testDb.appDb, admin.orgId, (tx) =>
      createApiKey(tx, admin, { name: "My IDE", scopes: ["prompts:read"] }),
    );

    const rows = await withTenantContext(testDb.appDb, admin.orgId, (tx) =>
      tx.execute<{ key_hash: string; prefix: string }>(
        sql`select key_hash, prefix from identity_access.api_keys where id = ${id}`,
      ),
    );
    const row = rows[0];
    expect(row?.prefix).toBe(rawKey.slice(0, 12));
    expect(row?.key_hash).not.toBe(rawKey);
    expect(row?.key_hash).not.toContain(rawKey);

    const allColumns = await withTenantContext(testDb.appDb, admin.orgId, (tx) =>
      tx.execute<Record<string, unknown>>(
        sql`select * from identity_access.api_keys where id = ${id}`,
      ),
    );
    const serialized = JSON.stringify(allColumns[0]);
    expect(serialized).not.toContain(rawKey);
  });

  it("stores null expiresAt when omitted, and the exact value when provided", async () => {
    const admin = await makeUser(testDb, "admin");

    const { id: idNoExpiry } = await withTenantContext(testDb.appDb, admin.orgId, (tx) =>
      createApiKey(tx, admin, { name: "Never expires", scopes: ["prompts:read"] }),
    );
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60);
    const { id: idWithExpiry } = await withTenantContext(testDb.appDb, admin.orgId, (tx) =>
      createApiKey(tx, admin, { name: "Expires", scopes: ["prompts:read"], expiresAt }),
    );

    const rows = await withTenantContext(testDb.appDb, admin.orgId, (tx) =>
      tx.execute<{ id: string; expires_at: string | null }>(
        sql`select id, expires_at from identity_access.api_keys where id in (${idNoExpiry}, ${idWithExpiry})`,
      ),
    );
    const noExpiryRow = rows.find((r) => r.id === idNoExpiry);
    const withExpiryRow = rows.find((r) => r.id === idWithExpiry);
    expect(noExpiryRow?.expires_at).toBeNull();
    expect(new Date(withExpiryRow!.expires_at!).getTime()).toBe(expiresAt.getTime());
  });

  it("records exactly one api_key.created audit event on success", async () => {
    const admin = await makeUser(testDb, "admin");

    const result = await withTenantContext(testDb.appDb, admin.orgId, (tx) =>
      createApiKey(
        tx,
        admin,
        { name: "My IDE", scopes: ["prompts:read"] },
        { transport: "api", sourceIp: "198.51.100.99" },
      ),
    );

    const rows = await queryAuditEvents(
      testDb,
      admin.orgId,
      sql`action = 'api_key.created' and resource_id = ${result.id}`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.transport).toBe("api");
    expect(rows[0]?.source_ip).toBe("198.51.100.99");
  });

  it("never logs any portion of the raw key (FR-011, tenet S3)", async () => {
    const infoSpy = vi.spyOn(logger, "info");
    const warnSpy = vi.spyOn(logger, "warn");
    const errorSpy = vi.spyOn(logger, "error");
    const debugSpy = vi.spyOn(logger, "debug");
    const admin = await makeUser(testDb, "admin");

    const { rawKey } = await withTenantContext(testDb.appDb, admin.orgId, (tx) =>
      createApiKey(tx, admin, { name: "My IDE", scopes: ["prompts:read"] }),
    );

    for (const spy of [infoSpy, warnSpy, errorSpy, debugSpy]) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(rawKey);
      }
    }
  });
});
