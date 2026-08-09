import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withTenantContext } from "@/shared/db/tenant-context";
import type { UserSummary } from "../domain/user";
import { CrossOrgUserAccessError, LastActiveAdminError, NotAuthorizedError } from "../domain/user";
import { insert as insertOrg } from "../infrastructure/organizations-repo";
import { insert as insertTeam } from "../infrastructure/teams-repo";
import { findById } from "../infrastructure/users-repo";
import { insertValidatedUser } from "./insert-validated-user";
import { deactivateUser } from "./deactivate-user";

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
  const { id } = await insertValidatedUser(testDb.authDb, {
    organizationId,
    teamId,
    username: `user-${randomUUID()}`,
    displayName: "Some User",
    email: `user-${randomUUID()}@example.com`,
    password: "password123",
    role,
  });
  const row = await findById(testDb.authDb, id);
  if (!row) {
    throw new Error("fixture setup failed");
  }
  return {
    id: row.id,
    orgId: row.organizationId,
    teamId: row.teamId,
    role: row.role as "admin" | "member",
    email: row.email,
  };
}

describe("deactivateUser", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("deactivates a non-last-admin user, retaining the row", async () => {
    const { organizationId, teamId } = await makeOrgWithTeam(testDb);
    const admin = await makeUser(testDb, organizationId, teamId, "admin");
    const otherAdmin = await makeUser(testDb, organizationId, teamId, "admin");

    await withTenantContext(testDb.appDb, organizationId, (tx) =>
      deactivateUser(tx, admin, otherAdmin.id),
    );

    const row = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      findById(tx, otherAdmin.id),
    );
    expect(row?.isActive).toBe(false);
  });

  it("rejects a non-admin caller", async () => {
    const { organizationId, teamId } = await makeOrgWithTeam(testDb);
    const nonAdmin = await makeUser(testDb, organizationId, teamId, "member");
    const target = await makeUser(testDb, organizationId, teamId, "member");

    await expect(
      withTenantContext(testDb.appDb, organizationId, (tx) =>
        deactivateUser(tx, nonAdmin, target.id),
      ),
    ).rejects.toThrow(NotAuthorizedError);
  });

  it("rejects deactivating the organization's last remaining active admin", async () => {
    const { organizationId, teamId } = await makeOrgWithTeam(testDb);
    const soleAdmin = await makeUser(testDb, organizationId, teamId, "admin");

    await expect(
      withTenantContext(testDb.appDb, organizationId, (tx) =>
        deactivateUser(tx, soleAdmin, soleAdmin.id),
      ),
    ).rejects.toThrow(LastActiveAdminError);

    const row = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      findById(tx, soleAdmin.id),
    );
    expect(row?.isActive).toBe(true);
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
        deactivateUser(tx, admin, targetInOtherOrg.id),
      ),
    ).rejects.toThrow(CrossOrgUserAccessError);
  });

  it("records exactly one user.updated audit event on successful deactivation", async () => {
    const { organizationId, teamId } = await makeOrgWithTeam(testDb);
    const admin = await makeUser(testDb, organizationId, teamId, "admin");
    const otherAdmin = await makeUser(testDb, organizationId, teamId, "admin");

    await withTenantContext(testDb.appDb, organizationId, (tx) =>
      deactivateUser(tx, admin, otherAdmin.id, {
        auditContext: { transport: "web", sourceIp: "203.0.113.99" },
      }),
    );

    const rows = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      tx.execute<{
        action: string;
        resource_id: string | null;
        transport: string;
        source_ip: string | null;
      }>(
        sql`select action, resource_id, transport, source_ip from audit.audit_events where resource_id = ${otherAdmin.id} and action = 'user.updated'`,
      ),
    );

    expect(Array.from(rows)).toEqual([
      {
        action: "user.updated",
        resource_id: otherAdmin.id,
        transport: "web",
        source_ip: "203.0.113.99",
      },
    ]);
  });

});
