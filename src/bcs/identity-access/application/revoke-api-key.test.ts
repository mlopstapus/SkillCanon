import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withTenantContext } from "@/shared/db/tenant-context";
import * as auditCompliance from "@/bcs/audit-compliance";
import { NotAuthorizedError, type UserSummary } from "../domain/user";
import { ApiKeyNotFoundError } from "../domain/api-key";
import { insert as insertOrg } from "../infrastructure/organizations-repo";
import { insert as insertTeam } from "../infrastructure/teams-repo";
import { insert as insertUser } from "../infrastructure/users-repo";
import { createApiKey } from "./create-api-key";
import { authenticateApiKey } from "./authenticate-api-key";
import { revokeApiKey } from "./revoke-api-key";

async function queryAuditEvents(testDb: TestDb, organizationId: string, whereSql: ReturnType<typeof sql>) {
  // Read via appDb, not authDb — skillcanon_auth has no grant on the audit
  // schema (011-tenant-isolation-rls scopes it to identity_access only);
  // skillcanon_app can already read every schema (0000_create_schemas.sql).
  // audit.audit_events is now RLS-protected for skillcanon_app
  // (003-audit-compliance/004-audit-events-rls) — the read must run inside
  // a tenant-context-scoped connection, same as any other org-scoped table.
  const result = await withTenantContext(testDb.appDb, organizationId, (tx) =>
    tx.execute<{ action: string; resource_id: string | null }>(
      sql`select action, resource_id from audit.audit_events where ${whereSql}`,
    ),
  );
  return Array.from(result);
}

async function makeOrgWithTeam(testDb: TestDb) {
  const { id: organizationId } = await insertOrg(testDb.authDb, {
    name: "Acme",
    slug: `acme-${randomUUID()}`,
  });
  const { id: teamId } = await insertTeam(testDb.authDb, {
    organizationId,
    name: "Root",
    slug: `root-${randomUUID()}`,
  });
  return { organizationId, teamId };
}

async function makeUser(
  testDb: TestDb,
  organizationId: string,
  teamId: string,
  role: "admin" | "member" = "member",
): Promise<UserSummary> {
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

describe("revokeApiKey", () => {
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

  it("allows a key's owner to revoke their own key", async () => {
    const { organizationId, teamId } = await makeOrgWithTeam(testDb);
    const owner = await makeUser(testDb, organizationId, teamId, "member");
    const { id, rawKey } = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      createApiKey(tx, owner, { name: "My IDE", scopes: ["prompts:read"] }),
    );

    await withTenantContext(testDb.appDb, organizationId, (tx) => revokeApiKey(tx, owner, id));

    const result = await authenticateApiKey(testDb.authDb, rawKey);
    expect(result).toBeNull();
  });

  it("allows an org admin to revoke a key belonging to a different user in the same org", async () => {
    const { organizationId, teamId } = await makeOrgWithTeam(testDb);
    const owner = await makeUser(testDb, organizationId, teamId, "member");
    const admin = await makeUser(testDb, organizationId, teamId, "admin");
    const { id, rawKey } = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      createApiKey(tx, owner, { name: "My IDE", scopes: ["prompts:read"] }),
    );

    await withTenantContext(testDb.appDb, organizationId, (tx) => revokeApiKey(tx, admin, id));

    const result = await authenticateApiKey(testDb.authDb, rawKey);
    expect(result).toBeNull();
  });

  it("rejects a caller who is neither the owner nor an admin of the owner's organization", async () => {
    const { organizationId, teamId } = await makeOrgWithTeam(testDb);
    const owner = await makeUser(testDb, organizationId, teamId, "member");
    const otherMember = await makeUser(testDb, organizationId, teamId, "member");
    const { id } = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      createApiKey(tx, owner, { name: "My IDE", scopes: ["prompts:read"] }),
    );

    await expect(
      withTenantContext(testDb.appDb, organizationId, (tx) => revokeApiKey(tx, otherMember, id)),
    ).rejects.toThrow(NotAuthorizedError);
  });

  it("is a no-op (no error, no additional audit event) when revoking an already-revoked key", async () => {
    const { organizationId, teamId } = await makeOrgWithTeam(testDb);
    const owner = await makeUser(testDb, organizationId, teamId, "member");
    const { id } = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      createApiKey(tx, owner, { name: "My IDE", scopes: ["prompts:read"] }),
    );
    await withTenantContext(testDb.appDb, organizationId, (tx) => revokeApiKey(tx, owner, id));

    await expect(
      withTenantContext(testDb.appDb, organizationId, (tx) => revokeApiKey(tx, owner, id)),
    ).resolves.toBeUndefined();

    const rows = await queryAuditEvents(
      testDb,
      organizationId,
      sql`action = 'api_key.revoked' and resource_id = ${id}`,
    );
    expect(rows).toHaveLength(1);
  });

  it("rejects a nonexistent or wrong-organization id with ApiKeyNotFoundError", async () => {
    const { organizationId, teamId } = await makeOrgWithTeam(testDb);
    const admin = await makeUser(testDb, organizationId, teamId, "admin");

    await expect(
      withTenantContext(testDb.appDb, organizationId, (tx) =>
        revokeApiKey(tx, admin, randomUUID()),
      ),
    ).rejects.toThrow(ApiKeyNotFoundError);
  });

  it("records exactly one api_key.revoked audit event for the real revoke", async () => {
    const { organizationId, teamId } = await makeOrgWithTeam(testDb);
    const owner = await makeUser(testDb, organizationId, teamId, "member");
    const { id } = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      createApiKey(tx, owner, { name: "My IDE", scopes: ["prompts:read"] }),
    );
    const recordSpy = vi.spyOn(auditCompliance, "record");

    await withTenantContext(testDb.appDb, organizationId, (tx) => revokeApiKey(tx, owner, id));

    const revokeCalls = recordSpy.mock.calls.filter(
      (call) => call[1].action === "api_key.revoked",
    );
    expect(revokeCalls).toHaveLength(1);
  });
});
