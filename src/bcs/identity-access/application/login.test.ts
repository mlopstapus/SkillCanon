import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import * as auditCompliance from "@/bcs/audit-compliance";
import { insert as insertOrg } from "../infrastructure/organizations-repo";
import { insert as insertTeam } from "../infrastructure/teams-repo";
import { update as updateUserRow } from "../infrastructure/users-repo";
import { insertValidatedUser } from "./insert-validated-user";
import { login } from "./login";

/**
 * Reads back audit_events rows via raw SQL rather than importing
 * audit-compliance's internal schema module — cross-BC test assertions
 * stay off the module-boundary lint's radar entirely this way, instead of
 * reaching into another BC's infrastructure/ directly.
 */
async function queryAuditEvents(testDb: TestDb, whereSql: ReturnType<typeof sql>) {
  // Read via appDb, not authDb — skillcanon_auth has no grant on the audit
  // schema (011-tenant-isolation-rls scopes it to identity_access only);
  // skillcanon_app can already read every schema (0000_create_schemas.sql).
  const result = await testDb.appDb.execute<{
    action: string;
    actor_user_id: string | null;
    organization_id: string | null;
    resource_id: string | null;
    transport: string;
    source_ip: string | null;
  }>(sql`select action, actor_user_id, organization_id, resource_id, transport, source_ip from audit.audit_events where ${whereSql}`);
  return Array.from(result);
}

async function makeOrgTeamUser(
  testDb: TestDb,
  overrides: { isActive?: boolean } = {},
) {
  const { id: organizationId } = await insertOrg(testDb.authDb, {
    name: "Acme",
    slug: `acme-${randomUUID()}`,
  });
  const { id: teamId } = await insertTeam(testDb.authDb, {
    organizationId,
    name: "Root",
    slug: `root-${randomUUID()}`,
  });
  const email = `jane-${randomUUID()}@example.com`;
  const { id: userId } = await insertValidatedUser(testDb.authDb, {
    organizationId,
    teamId,
    username: `jdoe-${randomUUID()}`,
    displayName: "Jane Doe",
    email,
    password: "correct-horse-battery",
    role: "admin",
  });
  if (overrides.isActive === false) {
    await updateUserRow(testDb.authDb, userId, { isActive: false });
  }
  return { organizationId, teamId, userId, email };
}

describe("login", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  beforeEach(() => {
    vi.stubEnv("JWT_SECRET", "a-real-signing-secret-for-tests");
    vi.stubEnv("JWT_EXPIRY_HOURS", "24");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns user + cookie for correct credentials, cookie flags match convention", async () => {
    const { userId, organizationId, teamId, email } = await makeOrgTeamUser(testDb);

    const result = await login(testDb.authDb, email, "correct-horse-battery");

    expect(result).not.toBeNull();
    expect(result?.user).toEqual({
      id: userId,
      orgId: organizationId,
      teamId,
      role: "admin",
      email,
    });
    expect(result?.cookie.httpOnly).toBe(true);
    expect(result?.cookie.sameSite).toBe("lax");
    expect(result?.cookie.secure).toBe(false); // NODE_ENV !== "production" in the test runner
    expect(result?.cookie.value).toBeTruthy();
  });

  it("returns null for a wrong password", async () => {
    const { email } = await makeOrgTeamUser(testDb);

    const result = await login(testDb.authDb, email, "totally-wrong-password");

    expect(result).toBeNull();
  });

  it("returns null (same shape as wrong password) for an unknown email", async () => {
    const result = await login(
      testDb.authDb,
      `nobody-${randomUUID()}@example.com`,
      "whatever-password",
    );

    expect(result).toBeNull();
  });

  it("returns null for a deactivated user with correct password", async () => {
    const { email } = await makeOrgTeamUser(testDb, { isActive: false });

    const result = await login(testDb.authDb, email, "correct-horse-battery");

    expect(result).toBeNull();
  });

  it("writes a user.login audit event on success", async () => {
    const { userId, organizationId, email } = await makeOrgTeamUser(testDb);

    await login(testDb.authDb, email, "correct-horse-battery", {
      transport: "web",
      sourceIp: "203.0.113.66",
    });

    const rows = await queryAuditEvents(testDb, sql`actor_user_id = ${userId}`);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe("user.login");
    expect(rows[0]?.organization_id).toBe(organizationId);
    expect(rows[0]?.transport).toBe("web");
    expect(rows[0]?.source_ip).toBe("203.0.113.66");
  });

  it("writes a user.login_failed audit event for a failed attempt against a real account", async () => {
    const { userId, organizationId, email } = await makeOrgTeamUser(testDb);

    await login(testDb.authDb, email, "wrong-password");

    const rows = await queryAuditEvents(testDb, sql`actor_user_id = ${userId}`);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe("user.login_failed");
    expect(rows[0]?.organization_id).toBe(organizationId);
  });

  it("writes a user.login_failed audit event with null actor/org for an unknown email", async () => {
    const email = `nobody-${randomUUID()}@example.com`;

    await login(testDb.authDb, email, "whatever-password");

    const rows = await queryAuditEvents(testDb, sql`action = 'user.login_failed'`);
    const match = rows.find(
      (row) => row.actor_user_id === null && row.organization_id === null,
    );
    expect(match).toBeTruthy();
  });

  it("never writes the submitted password anywhere in an audit row", async () => {
    const { email } = await makeOrgTeamUser(testDb);
    const password = `super-secret-${randomUUID()}`;

    await login(testDb.authDb, email, password);

    const rows = await queryAuditEvents(testDb, sql`true`);
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain(password);
  });

  it("propagates an error (does not return a cookie or null) when the audit write fails, on the success path", async () => {
    const { email } = await makeOrgTeamUser(testDb);
    vi.spyOn(auditCompliance, "record").mockRejectedValueOnce(new Error("audit store unavailable"));

    await expect(login(testDb.authDb, email, "correct-horse-battery")).rejects.toThrow(
      "audit store unavailable",
    );
  });

  it("propagates an error when the audit write fails, on a failure path", async () => {
    const { email } = await makeOrgTeamUser(testDb);
    vi.spyOn(auditCompliance, "record").mockRejectedValueOnce(new Error("audit store unavailable"));

    await expect(login(testDb.authDb, email, "wrong-password")).rejects.toThrow(
      "audit store unavailable",
    );
  });

  it("throws (does not return null or a cookie) when JWT_SECRET is missing, for otherwise-correct credentials", async () => {
    const { email } = await makeOrgTeamUser(testDb);
    vi.stubEnv("JWT_SECRET", "");

    await expect(login(testDb.authDb, email, "correct-horse-battery")).rejects.toThrow(
      /missing/i,
    );
  });

  it("throws when JWT_SECRET is the documented placeholder, for otherwise-correct credentials", async () => {
    const { email } = await makeOrgTeamUser(testDb);
    vi.stubEnv("JWT_SECRET", "REPLACE_ME_JWT_SECRET");

    await expect(login(testDb.authDb, email, "correct-horse-battery")).rejects.toThrow(
      /placeholder/i,
    );
  });

  it("succeeds normally once a real JWT_SECRET is restored", async () => {
    const { email } = await makeOrgTeamUser(testDb);
    vi.stubEnv("JWT_SECRET", "a-different-real-secret");

    const result = await login(testDb.authDb, email, "correct-horse-battery");

    expect(result).not.toBeNull();
  });
});
