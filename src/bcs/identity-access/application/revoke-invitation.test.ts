import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withTenantContext } from "@/shared/db/tenant-context";
import type { UserSummary } from "../domain/user";
import { NotAuthorizedError } from "../domain/user";
import { InvitationAlreadyAcceptedError, InvitationNotFoundError, InvitationRevokedError } from "../domain/invitation";
import { insert as insertOrg } from "../infrastructure/organizations-repo";
import { insert as insertTeam } from "../infrastructure/teams-repo";
import { insert as insertUser } from "../infrastructure/users-repo";
import { insert as insertInvitation } from "../infrastructure/invitations-repo";
import { acceptInvitation } from "./accept-invitation";
import { revokeInvitation } from "./revoke-invitation";

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
  const admin: UserSummary = {
    id: adminId,
    orgId: organizationId,
    teamId,
    role: "admin",
    email: "admin@example.com",
  };
  return { organizationId, teamId, admin };
}

async function makePendingInvitation(
  testDb: TestDb,
  fixture: { organizationId: string; teamId: string; admin: UserSummary },
) {
  const token = randomUUID();
  const { id } = await insertInvitation(testDb.authDb, {
    organizationId: fixture.organizationId,
    teamId: fixture.teamId,
    email: `new.hire-${randomUUID()}@example.com`,
    role: "member",
    token,
    invitedById: fixture.admin.id,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60),
  });
  return { id, token };
}

describe("revokeInvitation", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("allows an org admin to revoke a pending invitation, after which acceptance throws InvitationRevokedError", async () => {
    const fixture = await makeOrgTeamAdmin(testDb);
    const { id, token } = await makePendingInvitation(testDb, fixture);

    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      revokeInvitation(tx, fixture.admin, id),
    );

    await expect(
      acceptInvitation(testDb.authDb, token, {
        username: `newhire-${randomUUID()}`,
        password: "correct horse battery staple",
      }),
    ).rejects.toThrow(InvitationRevokedError);
  });

  it("allows the target team's owner (non-admin) to revoke", async () => {
    const { organizationId } = await makeOrgTeamAdmin(testDb);
    const bootstrapTeam = await insertTeam(testDb.authDb, {
      organizationId,
      name: "Bootstrap",
      slug: `bootstrap-${randomUUID()}`,
    });
    const ownerBootstrap = await insertUser(testDb.authDb, {
      organizationId,
      teamId: bootstrapTeam.id,
      username: `owner-${randomUUID()}`,
      displayName: "Owner",
      email: `owner-${randomUUID()}@example.com`,
      passwordHash: "hash",
      role: "member",
    });
    const { id: teamId } = await insertTeam(testDb.authDb, {
      organizationId,
      name: "Owned",
      slug: `owned-${randomUUID()}`,
      ownerId: ownerBootstrap.id,
    });
    const owner: UserSummary = {
      id: ownerBootstrap.id,
      orgId: organizationId,
      teamId,
      role: "member",
      email: "owner@example.com",
    };
    const { id: invitationId } = await makePendingInvitation(testDb, {
      organizationId,
      teamId,
      admin: owner,
    });

    await expect(
      withTenantContext(testDb.appDb, organizationId, (tx) =>
        revokeInvitation(tx, owner, invitationId),
      ),
    ).resolves.toBeUndefined();
  });

  it("rejects a caller who is neither an admin nor the team's owner", async () => {
    const fixture = await makeOrgTeamAdmin(testDb);
    const { id } = await makePendingInvitation(testDb, fixture);
    const nonOwnerMember: UserSummary = {
      id: randomUUID(),
      orgId: fixture.organizationId,
      teamId: fixture.teamId,
      role: "member",
      email: "member@example.com",
    };

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        revokeInvitation(tx, nonOwnerMember, id),
      ),
    ).rejects.toThrow(NotAuthorizedError);
  });

  it("rejects revoking an already-accepted invitation and does not alter the resulting account", async () => {
    const fixture = await makeOrgTeamAdmin(testDb);
    const { id, token } = await makePendingInvitation(testDb, fixture);
    const { user } = await acceptInvitation(testDb.authDb, token, {
      username: `newhire-${randomUUID()}`,
      password: "correct horse battery staple",
    });

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        revokeInvitation(tx, fixture.admin, id),
      ),
    ).rejects.toThrow(InvitationAlreadyAcceptedError);

    const rows = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      tx.execute<{ is_active: boolean }>(
        sql`select is_active from identity_access.users where id = ${user.id}`,
      ),
    );
    expect(rows[0]?.is_active).toBe(true);
  });

  it("is a no-op when revoking an already-revoked invitation — resolves without error and writes no additional audit event", async () => {
    const fixture = await makeOrgTeamAdmin(testDb);
    const { id } = await makePendingInvitation(testDb, fixture);

    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      revokeInvitation(tx, fixture.admin, id),
    );
    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        revokeInvitation(tx, fixture.admin, id),
      ),
    ).resolves.toBeUndefined();

    const rows = await queryAuditEvents(
      testDb,
      fixture.organizationId,
      sql`action = 'invitation.revoked' and resource_id = ${id}`,
    );
    expect(rows).toHaveLength(1);
  });

  it("rejects revoking a nonexistent or wrong-organization id", async () => {
    const fixture = await makeOrgTeamAdmin(testDb);
    const other = await makeOrgTeamAdmin(testDb);
    const { id: otherInvitationId } = await makePendingInvitation(testDb, other);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        revokeInvitation(tx, fixture.admin, randomUUID()),
      ),
    ).rejects.toThrow(InvitationNotFoundError);
    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        revokeInvitation(tx, fixture.admin, otherInvitationId),
      ),
    ).rejects.toThrow(InvitationNotFoundError);
  });

  it("records exactly one invitation.revoked audit event for the real revoke", async () => {
    const fixture = await makeOrgTeamAdmin(testDb);
    const { id } = await makePendingInvitation(testDb, fixture);

    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      revokeInvitation(tx, fixture.admin, id),
    );

    const rows = await queryAuditEvents(
      testDb,
      fixture.organizationId,
      sql`action = 'invitation.revoked' and resource_id = ${id}`,
    );
    expect(rows).toHaveLength(1);
  });
});
