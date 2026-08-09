import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withTenantContext } from "@/shared/db/tenant-context";
import * as email from "@/shared/email";
import type { UserSummary } from "../domain/user";
import { DuplicateUserError, InvalidTeamAssignmentError, NotAuthorizedError } from "../domain/user";
import { DuplicateInvitationError } from "../domain/invitation";
import { insert as insertOrg } from "../infrastructure/organizations-repo";
import { insert as insertTeam } from "../infrastructure/teams-repo";
import { insert as insertUser } from "../infrastructure/users-repo";
import { insert as insertInvitation, markRevoked } from "../infrastructure/invitations-repo";
import { inviteUser } from "./invite-user";

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

/** `invited_by_id` FKs to a real `users` row, so every acting user in these tests must actually be persisted first. */
async function makePersistedUser(
  testDb: TestDb,
  organizationId: string,
  teamId: string,
  role: "admin" | "member" = "admin",
): Promise<UserSummary> {
  const { id } = await insertUser(testDb.authDb, {
    organizationId,
    teamId,
    username: `acting-${randomUUID()}`,
    displayName: "Acting User",
    email: `acting-${randomUUID()}@example.com`,
    passwordHash: "hash",
    role,
  });
  return { id, orgId: organizationId, teamId, role, email: "acting@example.com" };
}

describe("inviteUser", () => {
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

  it("allows an org admin to invite an email to a team", async () => {
    const { organizationId, teamId } = await makeOrgWithTeam(testDb);
    const admin = await makePersistedUser(testDb, organizationId, teamId, "admin");
    vi.spyOn(email, "sendEmail").mockResolvedValueOnce(undefined);

    const result = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      inviteUser(tx, admin, {
        teamId,
        email: "new.hire@example.com",
      }),
    );

    expect(result.id).toBeTruthy();
    expect(result.token).toBeTruthy();
  });

  it("allows the target team's owner (a non-admin) to invite for their own team", async () => {
    const { organizationId, teamId: bootstrapTeamId } = await makeOrgWithTeam(testDb);
    const owner = await makePersistedUser(testDb, organizationId, bootstrapTeamId, "member");
    const { id: teamId } = await insertTeam(testDb.authDb, {
      organizationId,
      name: "Owned Team",
      slug: `owned-${randomUUID()}`,
      ownerId: owner.id,
    });
    vi.spyOn(email, "sendEmail").mockResolvedValueOnce(undefined);

    const result = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      inviteUser(tx, { ...owner, teamId }, { teamId, email: "new.hire@example.com" }),
    );

    expect(result.id).toBeTruthy();
  });

  it("rejects a caller who is neither an admin nor the team's owner", async () => {
    const { organizationId, teamId } = await makeOrgWithTeam(testDb);
    const nonOwnerMember = await makePersistedUser(testDb, organizationId, teamId, "member");

    await expect(
      withTenantContext(testDb.appDb, organizationId, (tx) =>
        inviteUser(tx, nonOwnerMember, { teamId, email: "new.hire@example.com" }),
      ),
    ).rejects.toThrow(NotAuthorizedError);
  });

  it("rejects a teamId belonging to a different organization than the acting user (M1/M3)", async () => {
    const orgA = await makeOrgWithTeam(testDb);
    const orgB = await makeOrgWithTeam(testDb);
    const admin = await makePersistedUser(testDb, orgA.organizationId, orgA.teamId, "admin");

    await expect(
      withTenantContext(testDb.appDb, orgA.organizationId, (tx) =>
        inviteUser(tx, admin, {
          teamId: orgB.teamId,
          email: "new.hire@example.com",
        }),
      ),
    ).rejects.toThrow(InvalidTeamAssignmentError);
  });

  it("rejects a duplicate active invitation for the same email in the same org, even targeting a different team", async () => {
    const { organizationId, teamId } = await makeOrgWithTeam(testDb);
    const { id: otherTeamId } = await insertTeam(testDb.authDb, {
      organizationId,
      name: "Other",
      slug: `other-${randomUUID()}`,
    });
    const admin = await makePersistedUser(testDb, organizationId, teamId, "admin");
    vi.spyOn(email, "sendEmail").mockResolvedValue(undefined);
    const targetEmail = `dup-${randomUUID()}@example.com`;

    await withTenantContext(testDb.appDb, organizationId, (tx) =>
      inviteUser(tx, admin, { teamId, email: targetEmail }),
    );

    await expect(
      withTenantContext(testDb.appDb, organizationId, (tx) =>
        inviteUser(tx, admin, { teamId: otherTeamId, email: targetEmail }),
      ),
    ).rejects.toThrow(DuplicateInvitationError);
  });

  it("rejects an email already belonging to an active user in the same org", async () => {
    const { organizationId, teamId } = await makeOrgWithTeam(testDb);
    const admin = await makePersistedUser(testDb, organizationId, teamId, "admin");
    const existingEmail = `existing-${randomUUID()}@example.com`;
    await insertUser(testDb.authDb, {
      organizationId,
      teamId,
      username: `existing-${randomUUID()}`,
      displayName: "Existing",
      email: existingEmail,
      passwordHash: "hash",
      role: "member",
    });

    await expect(
      withTenantContext(testDb.appDb, organizationId, (tx) =>
        inviteUser(tx, admin, { teamId, email: existingEmail }),
      ),
    ).rejects.toThrow(DuplicateUserError);
  });

  it("does not block an invite when the email is already active in a different organization", async () => {
    const orgA = await makeOrgWithTeam(testDb);
    const orgB = await makeOrgWithTeam(testDb);
    const admin = await makePersistedUser(testDb, orgA.organizationId, orgA.teamId, "admin");
    const sharedEmail = `shared-${randomUUID()}@example.com`;
    await insertUser(testDb.authDb, {
      organizationId: orgB.organizationId,
      teamId: orgB.teamId,
      username: `shared-${randomUUID()}`,
      displayName: "Shared",
      email: sharedEmail,
      passwordHash: "hash",
      role: "member",
    });
    vi.spyOn(email, "sendEmail").mockResolvedValueOnce(undefined);

    const result = await withTenantContext(testDb.appDb, orgA.organizationId, (tx) =>
      inviteUser(tx, admin, {
        teamId: orgA.teamId,
        email: sharedEmail,
      }),
    );

    expect(result.id).toBeTruthy();
  });

  it("does not block a new invite when a prior invitation for the same email expired", async () => {
    const { organizationId, teamId } = await makeOrgWithTeam(testDb);
    const admin = await makePersistedUser(testDb, organizationId, teamId, "admin");
    const targetEmail = `stale-${randomUUID()}@example.com`;

    await insertInvitation(testDb.authDb, {
      organizationId,
      teamId,
      email: targetEmail,
      role: "member",
      token: randomUUID(),
      invitedById: admin.id,
      expiresAt: new Date(Date.now() - 1000),
    });

    vi.spyOn(email, "sendEmail").mockResolvedValueOnce(undefined);

    const result = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      inviteUser(tx, admin, { teamId, email: targetEmail }),
    );

    expect(result.id).toBeTruthy();
  });

  it("does not block a new invite when a prior invitation for the same email was revoked", async () => {
    const { organizationId, teamId } = await makeOrgWithTeam(testDb);
    const admin = await makePersistedUser(testDb, organizationId, teamId, "admin");
    const targetEmail = `revoked-${randomUUID()}@example.com`;

    const { id: revokedInvId } = await insertInvitation(testDb.authDb, {
      organizationId,
      teamId,
      email: targetEmail,
      role: "member",
      token: randomUUID(),
      invitedById: admin.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });
    await markRevoked(testDb.authDb, revokedInvId);

    vi.spyOn(email, "sendEmail").mockResolvedValueOnce(undefined);

    const result = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      inviteUser(tx, admin, { teamId, email: targetEmail }),
    );

    expect(result.id).toBeTruthy();
  });

  it("sets expires_at from INVITATION_EXPIRY_HOURS (default 168h)", async () => {
    const { organizationId, teamId } = await makeOrgWithTeam(testDb);
    const admin = await makePersistedUser(testDb, organizationId, teamId, "admin");
    vi.spyOn(email, "sendEmail").mockResolvedValueOnce(undefined);
    const before = Date.now();

    await withTenantContext(testDb.appDb, organizationId, (tx) =>
      inviteUser(tx, admin, {
        teamId,
        email: "new.hire@example.com",
      }),
    );

    const rows = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      tx.execute<{ expires_at: string }>(
        sql`select expires_at from identity_access.invitations where organization_id = ${organizationId}`,
      ),
    );
    const expiresAt = new Date(rows[0]!.expires_at).getTime();
    const expectedMs = 168 * 60 * 60 * 1000;
    expect(expiresAt - before).toBeGreaterThan(expectedMs - 5000);
    expect(expiresAt - before).toBeLessThan(expectedMs + 5000);
  });

  it("still creates the invitation even when email delivery fails (best-effort, FR-005)", async () => {
    const { organizationId, teamId } = await makeOrgWithTeam(testDb);
    const admin = await makePersistedUser(testDb, organizationId, teamId, "admin");
    vi.spyOn(email, "sendEmail").mockRejectedValueOnce(new Error("smtp down"));

    const result = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      inviteUser(tx, admin, {
        teamId,
        email: "new.hire@example.com",
      }),
    );

    expect(result.id).toBeTruthy();
  });

  it("records exactly one invitation.created audit event on success", async () => {
    const { organizationId, teamId } = await makeOrgWithTeam(testDb);
    const admin = await makePersistedUser(testDb, organizationId, teamId, "admin");
    vi.spyOn(email, "sendEmail").mockResolvedValueOnce(undefined);

    const result = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      inviteUser(tx, admin, {
        teamId,
        email: "new.hire@example.com",
      }),
    );

    const rows = await queryAuditEvents(
      testDb,
      organizationId,
      sql`action = 'invitation.created' and resource_id = ${result.id}`,
    );
    expect(rows).toHaveLength(1);
  });
});
