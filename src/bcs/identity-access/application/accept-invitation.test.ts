import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withTenantContext } from "@/shared/db/tenant-context";
import { DuplicateUserError, WeakPasswordError } from "../domain/user";
import {
  InvalidInvitationTokenError,
  InvitationAlreadyAcceptedError,
  InvitationExpiredError,
  InvitationRevokedError,
} from "../domain/invitation";
import { insert as insertOrg } from "../infrastructure/organizations-repo";
import { insert as insertTeam } from "../infrastructure/teams-repo";
import { insert as insertUser } from "../infrastructure/users-repo";
import { insert as insertInvitation, markRevoked } from "../infrastructure/invitations-repo";
import { acceptInvitation } from "./accept-invitation";

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

async function makeOrgTeamAdmin(testDb: TestDb) {
  const { id: organizationId } = await insertOrg(testDb.authDb, {
    name: "Acme",
    slug: `acme-${randomUUID()}`,
  });
  const { id: teamId } = await insertTeam(testDb.authDb, {
    organizationId,
    name: "Root",
    slug: `root-${randomUUID()}`,
  });
  const { id: adminId } = await insertUser(testDb.authDb, {
    organizationId,
    teamId,
    username: `admin-${randomUUID()}`,
    displayName: "Admin",
    email: `admin-${randomUUID()}@example.com`,
    passwordHash: "hash",
    role: "admin",
  });
  return { organizationId, teamId, adminId };
}

async function makeInvitation(
  testDb: TestDb,
  fixture: { organizationId: string; teamId: string; adminId: string },
  overrides: { expiresAt?: Date; email?: string; role?: "admin" | "member" } = {},
) {
  const token = randomUUID();
  const { id } = await insertInvitation(testDb.authDb, {
    organizationId: fixture.organizationId,
    teamId: fixture.teamId,
    email: overrides.email ?? `new.hire-${randomUUID()}@example.com`,
    role: overrides.role ?? "member",
    token,
    invitedById: fixture.adminId,
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 1000 * 60 * 60),
  });
  return { id, token };
}

describe("acceptInvitation", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("creates a user scoped to exactly the invitation's organization, team, and role", async () => {
    const fixture = await makeOrgTeamAdmin(testDb);
    const { token } = await makeInvitation(testDb, fixture, { role: "admin" });

    const { user } = await acceptInvitation(testDb.authDb, token, {
      username: `newhire-${randomUUID()}`,
      password: "correct horse battery staple",
    });

    expect(user.orgId).toBe(fixture.organizationId);
    expect(user.teamId).toBe(fixture.teamId);
    expect(user.role).toBe("admin");
  });

  it("never lands the accepted account in a different organization (M3): org A's invitation cannot resolve into org B", async () => {
    const orgA = await makeOrgTeamAdmin(testDb);
    const orgB = await makeOrgTeamAdmin(testDb);
    const { token } = await makeInvitation(testDb, orgA);

    const { user } = await acceptInvitation(testDb.authDb, token, {
      username: `newhire-${randomUUID()}`,
      password: "correct horse battery staple",
    });

    expect(user.orgId).toBe(orgA.organizationId);
    expect(user.orgId).not.toBe(orgB.organizationId);
  });

  it("rejects accepting the same token twice", async () => {
    const fixture = await makeOrgTeamAdmin(testDb);
    const { token } = await makeInvitation(testDb, fixture);

    await acceptInvitation(testDb.authDb, token, {
      username: `newhire-${randomUUID()}`,
      password: "correct horse battery staple",
    });

    await expect(
      acceptInvitation(testDb.authDb, token, {
        username: `newhire2-${randomUUID()}`,
        password: "correct horse battery staple",
      }),
    ).rejects.toThrow(InvitationAlreadyAcceptedError);
  });

  it("rejects an expired token", async () => {
    const fixture = await makeOrgTeamAdmin(testDb);
    const { token } = await makeInvitation(testDb, fixture, {
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(
      acceptInvitation(testDb.authDb, token, {
        username: `newhire-${randomUUID()}`,
        password: "correct horse battery staple",
      }),
    ).rejects.toThrow(InvitationExpiredError);
  });

  it("rejects a revoked token", async () => {
    const fixture = await makeOrgTeamAdmin(testDb);
    const { id, token } = await makeInvitation(testDb, fixture);
    await markRevoked(testDb.authDb, id);

    await expect(
      acceptInvitation(testDb.authDb, token, {
        username: `newhire-${randomUUID()}`,
        password: "correct horse battery staple",
      }),
    ).rejects.toThrow(InvitationRevokedError);
  });

  it("rejects an unknown token", async () => {
    await expect(
      acceptInvitation(testDb.authDb, "not-a-real-token", {
        username: `newhire-${randomUUID()}`,
        password: "correct horse battery staple",
      }),
    ).rejects.toThrow(InvalidInvitationTokenError);
  });

  it("rejects a username collision without consuming the token — a retry with a different username succeeds", async () => {
    const fixture = await makeOrgTeamAdmin(testDb);
    const takenUsername = `taken-${randomUUID()}`;
    await insertUser(testDb.authDb, {
      organizationId: fixture.organizationId,
      teamId: fixture.teamId,
      username: takenUsername,
      displayName: "Existing",
      email: `existing-${randomUUID()}@example.com`,
      passwordHash: "hash",
      role: "member",
    });
    const { token } = await makeInvitation(testDb, fixture);

    await expect(
      acceptInvitation(testDb.authDb, token, {
        username: takenUsername,
        password: "correct horse battery staple",
      }),
    ).rejects.toThrow(DuplicateUserError);

    const { user } = await acceptInvitation(testDb.authDb, token, {
      username: `available-${randomUUID()}`,
      password: "correct horse battery staple",
    });
    expect(user.orgId).toBe(fixture.organizationId);
  });

  it("rejects a password under 8 characters", async () => {
    const fixture = await makeOrgTeamAdmin(testDb);
    const { token } = await makeInvitation(testDb, fixture);

    await expect(
      acceptInvitation(testDb.authDb, token, {
        username: `newhire-${randomUUID()}`,
        password: "short1",
      }),
    ).rejects.toThrow(WeakPasswordError);
  });

  // No test exercises "the invitation's team was deleted before acceptance"
  // via a real delete: `invitations.team_id`'s foreign key means Postgres
  // itself refuses to delete a team while any invitation (pending, accepted,
  // expired, or revoked) still references it — discovered while writing this
  // test, a stronger guarantee than spec.md's edge case originally assumed
  // ("acceptance checks and rejects"), documented in data-model.md's
  // Relationships section instead. `insertValidatedUser`'s own team-existence
  // check (reused here, surfacing `InvalidTeamAssignmentError`) remains as a
  // defensive check inherited from that shared core, not something reachable
  // via this specific path.

  it("resolves exactly one of two concurrent accept attempts on the same token", async () => {
    const fixture = await makeOrgTeamAdmin(testDb);
    const { token } = await makeInvitation(testDb, fixture);

    const results = await Promise.allSettled([
      acceptInvitation(testDb.authDb, token, {
        username: `race-a-${randomUUID()}`,
        password: "correct horse battery staple",
      }),
      acceptInvitation(testDb.authDb, token, {
        username: `race-b-${randomUUID()}`,
        password: "correct horse battery staple",
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });

  it("records exactly one invitation.accepted audit event on success", async () => {
    const fixture = await makeOrgTeamAdmin(testDb);
    const { id: invitationId, token } = await makeInvitation(testDb, fixture);

    await acceptInvitation(testDb.authDb, token, {
      username: `newhire-${randomUUID()}`,
      password: "correct horse battery staple",
    });

    const rows = await queryAuditEvents(
      testDb,
      fixture.organizationId,
      sql`action = 'invitation.accepted' and resource_id = ${invitationId}`,
    );
    expect(rows).toHaveLength(1);
  });
});
