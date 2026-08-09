import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withTenantContext } from "@/shared/db/tenant-context";
import type { UserSummary } from "../domain/user";
import { CrossOrgUserAccessError, NotAuthorizedError } from "../domain/user";
import { insert as insertOrg } from "../infrastructure/organizations-repo";
import { insert as insertTeam } from "../infrastructure/teams-repo";
import { findById } from "../infrastructure/users-repo";
import { insertValidatedUser } from "./insert-validated-user";
import { updateUser } from "./update-user";

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
) {
  const { id } = await insertValidatedUser(testDb.authDb, {
    organizationId,
    teamId,
    username: `user-${randomUUID()}`,
    displayName: "Original Name",
    email: `user-${randomUUID()}@example.com`,
    password: "password123",
    role,
  });
  const row = await findById(testDb.authDb, id);
  if (!row) {
    throw new Error("fixture setup failed");
  }
  const actingUser: UserSummary = {
    id: row.id,
    orgId: row.organizationId,
    teamId: row.teamId,
    role: row.role as "admin" | "member",
    email: row.email,
  };
  return actingUser;
}

describe("updateUser", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("allows a user to update their own displayName", async () => {
    const { organizationId, teamId } = await makeOrgWithTeam(testDb);
    const self = await makeUser(testDb, organizationId, teamId, "member");

    await withTenantContext(testDb.appDb, organizationId, (tx) =>
      updateUser(tx, self, self.id, { displayName: "New Name" }),
    );

    const row = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      findById(tx, self.id),
    );
    expect(row?.displayName).toBe("New Name");
  });

  it("rejects a non-admin changing their own role/isActive/teamId", async () => {
    const { organizationId, teamId } = await makeOrgWithTeam(testDb);
    const self = await makeUser(testDb, organizationId, teamId, "member");

    await expect(
      withTenantContext(testDb.appDb, organizationId, (tx) =>
        updateUser(tx, self, self.id, { role: "admin" }),
      ),
    ).rejects.toThrow(NotAuthorizedError);
  });

  it("allows an admin to update any field for any user in their organization, including teamId", async () => {
    const { organizationId, teamId } = await makeOrgWithTeam(testDb);
    const { id: otherTeamId } = await insertTeam(testDb.authDb, {
      organizationId,
      name: "Other Team",
      slug: `other-${randomUUID()}`,
    });
    const admin = await makeUser(testDb, organizationId, teamId, "admin");
    const target = await makeUser(testDb, organizationId, teamId, "member");

    await withTenantContext(testDb.appDb, organizationId, (tx) =>
      updateUser(tx, admin, target.id, {
        teamId: otherTeamId,
        displayName: "Updated",
      }),
    );

    const row = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      findById(tx, target.id),
    );
    expect(row?.teamId).toBe(otherTeamId);
    expect(row?.displayName).toBe("Updated");
  });

  it("allows an admin to set teamId to null (unassign) with no team-existence check firing (019-account-team-settings-ui)", async () => {
    const { organizationId, teamId } = await makeOrgWithTeam(testDb);
    const admin = await makeUser(testDb, organizationId, teamId, "admin");
    const target = await makeUser(testDb, organizationId, teamId, "member");

    await withTenantContext(testDb.appDb, organizationId, (tx) =>
      updateUser(tx, admin, target.id, { teamId: null }),
    );

    const row = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      findById(tx, target.id),
    );
    expect(row?.teamId).toBeNull();
  });

  it("rejects a cross-org teamId the same way createUser does", async () => {
    const { organizationId, teamId } = await makeOrgWithTeam(testDb);
    const otherOrg = await makeOrgWithTeam(testDb);
    const admin = await makeUser(testDb, organizationId, teamId, "admin");
    const target = await makeUser(testDb, organizationId, teamId, "member");

    await expect(
      withTenantContext(testDb.appDb, organizationId, (tx) =>
        updateUser(tx, admin, target.id, {
          teamId: otherOrg.teamId,
        }),
      ),
    ).rejects.toThrow();
  });

  it("rejects a target user in a different organization", async () => {
    const orgA = await makeOrgWithTeam(testDb);
    const orgB = await makeOrgWithTeam(testDb);
    const admin = await makeUser(
      testDb,
      orgA.organizationId,
      orgA.teamId,
      "admin",
    );
    const targetInOtherOrg = await makeUser(
      testDb,
      orgB.organizationId,
      orgB.teamId,
      "member",
    );

    await expect(
      withTenantContext(testDb.appDb, orgA.organizationId, (tx) =>
        updateUser(tx, admin, targetInOtherOrg.id, {
          displayName: "Hijacked",
        }),
      ),
    ).rejects.toThrow(CrossOrgUserAccessError);
  });

  it("records exactly one user.updated audit event on success", async () => {
    const { organizationId, teamId } = await makeOrgWithTeam(testDb);
    const admin = await makeUser(testDb, organizationId, teamId, "admin");
    const target = await makeUser(testDb, organizationId, teamId, "member");

    await withTenantContext(testDb.appDb, organizationId, (tx) =>
      updateUser(
        tx,
        admin,
        target.id,
        { displayName: "Audited Update" },
        { auditContext: { transport: "api", sourceIp: "198.51.100.88" } },
      ),
    );

    const rows = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      tx.execute<{
        action: string;
        resource_id: string | null;
        transport: string;
        source_ip: string | null;
      }>(
        sql`select action, resource_id, transport, source_ip from audit.audit_events where resource_id = ${target.id} and action = 'user.updated'`,
      ),
    );

    expect(Array.from(rows)).toEqual([
      {
        action: "user.updated",
        resource_id: target.id,
        transport: "api",
        source_ip: "198.51.100.88",
      },
    ]);
  });

});
