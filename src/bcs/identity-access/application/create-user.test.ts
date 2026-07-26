import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withTenantContext } from "@/shared/db/tenant-context";
import type { UserSummary } from "../domain/user";
import {
  DuplicateUserError,
  InvalidTeamAssignmentError,
  NotAuthorizedError,
  WeakPasswordError,
} from "../domain/user";
import { insert as insertOrg } from "../infrastructure/organizations-repo";
import { insert as insertTeam } from "../infrastructure/teams-repo";
import { createUser } from "./create-user";

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

function adminActingUser(organizationId: string, teamId: string): UserSummary {
  return {
    id: randomUUID(),
    orgId: organizationId,
    teamId,
    role: "admin",
    email: "acting-admin@example.com",
  };
}

describe("createUser", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("allows two different organizations to each create a user with the same email", async () => {
    const orgA = await makeOrgWithTeam(testDb);
    const orgB = await makeOrgWithTeam(testDb);

    const resultA = await withTenantContext(testDb.appDb, orgA.organizationId, (tx) =>
      createUser(tx, adminActingUser(orgA.organizationId, orgA.teamId), {
        teamId: orgA.teamId,
        username: `admin-${randomUUID()}`,
        email: "admin@example.com",
        password: "password123",
      }),
    );
    const resultB = await withTenantContext(testDb.appDb, orgB.organizationId, (tx) =>
      createUser(tx, adminActingUser(orgB.organizationId, orgB.teamId), {
        teamId: orgB.teamId,
        username: `admin-${randomUUID()}`,
        email: "admin@example.com",
        password: "password123",
      }),
    );

    expect(resultA.id).toBeTruthy();
    expect(resultB.id).toBeTruthy();
    expect(resultA.id).not.toBe(resultB.id);
  });

  it("rejects a second user with the same email within one organization", async () => {
    const org = await makeOrgWithTeam(testDb);
    const acting = adminActingUser(org.organizationId, org.teamId);
    const email = `owner-${randomUUID()}@example.com`;

    await withTenantContext(testDb.appDb, org.organizationId, (tx) =>
      createUser(tx, acting, {
        teamId: org.teamId,
        username: `user-${randomUUID()}`,
        email,
        password: "password123",
      }),
    );

    await expect(
      withTenantContext(testDb.appDb, org.organizationId, (tx) =>
        createUser(tx, acting, {
          teamId: org.teamId,
          username: `user-${randomUUID()}`,
          email,
          password: "password123",
        }),
      ),
    ).rejects.toThrow(DuplicateUserError);
  });

  it("rejects a second user with the same username within one organization", async () => {
    const org = await makeOrgWithTeam(testDb);
    const acting = adminActingUser(org.organizationId, org.teamId);
    const username = `jsmith-${randomUUID()}`;

    await withTenantContext(testDb.appDb, org.organizationId, (tx) =>
      createUser(tx, acting, {
        teamId: org.teamId,
        username,
        email: `first-${randomUUID()}@example.com`,
        password: "password123",
      }),
    );

    await expect(
      withTenantContext(testDb.appDb, org.organizationId, (tx) =>
        createUser(tx, acting, {
          teamId: org.teamId,
          username,
          email: `second-${randomUUID()}@example.com`,
          password: "password123",
        }),
      ),
    ).rejects.toThrow(DuplicateUserError);
  });

  it("treats emails differing only by case as duplicates within one organization", async () => {
    const org = await makeOrgWithTeam(testDb);
    const acting = adminActingUser(org.organizationId, org.teamId);
    const slug = randomUUID();

    await withTenantContext(testDb.appDb, org.organizationId, (tx) =>
      createUser(tx, acting, {
        teamId: org.teamId,
        username: `owner-${slug}`,
        email: `Owner-${slug}@example.com`,
        password: "password123",
      }),
    );

    await expect(
      withTenantContext(testDb.appDb, org.organizationId, (tx) =>
        createUser(tx, acting, {
          teamId: org.teamId,
          username: `different-${slug}`,
          email: `owner-${slug}@example.com`,
          password: "password123",
        }),
      ),
    ).rejects.toThrow(DuplicateUserError);
  });

  it("rejects a non-admin actingUser", async () => {
    const org = await makeOrgWithTeam(testDb);
    const nonAdmin: UserSummary = {
      ...adminActingUser(org.organizationId, org.teamId),
      role: "member",
    };

    await expect(
      withTenantContext(testDb.appDb, org.organizationId, (tx) =>
        createUser(tx, nonAdmin, {
          teamId: org.teamId,
          username: `user-${randomUUID()}`,
          email: `user-${randomUUID()}@example.com`,
          password: "password123",
        }),
      ),
    ).rejects.toThrow(NotAuthorizedError);
  });

  it("rejects a teamId belonging to a different organization", async () => {
    const orgA = await makeOrgWithTeam(testDb);
    const orgB = await makeOrgWithTeam(testDb);
    const acting = adminActingUser(orgA.organizationId, orgA.teamId);

    await expect(
      withTenantContext(testDb.appDb, orgA.organizationId, (tx) =>
        createUser(tx, acting, {
          teamId: orgB.teamId,
          username: `user-${randomUUID()}`,
          email: `user-${randomUUID()}@example.com`,
          password: "password123",
        }),
      ),
    ).rejects.toThrow(InvalidTeamAssignmentError);
  });

  it("rejects a password under 8 characters, writing no row", async () => {
    const org = await makeOrgWithTeam(testDb);
    const acting = adminActingUser(org.organizationId, org.teamId);

    await expect(
      withTenantContext(testDb.appDb, org.organizationId, (tx) =>
        createUser(tx, acting, {
          teamId: org.teamId,
          username: `user-${randomUUID()}`,
          email: `user-${randomUUID()}@example.com`,
          password: "short1",
        }),
      ),
    ).rejects.toThrow(WeakPasswordError);
  });

  it("records exactly one user.created audit event on success without storing the raw password", async () => {
    const org = await makeOrgWithTeam(testDb);
    const acting = adminActingUser(org.organizationId, org.teamId);
    const password = `password-${randomUUID()}`;

    const result = await withTenantContext(testDb.appDb, org.organizationId, (tx) =>
      createUser(
        tx,
        acting,
        {
          teamId: org.teamId,
          username: `audited-${randomUUID()}`,
          email: `audited-${randomUUID()}@example.com`,
          password,
        },
        { auditContext: { transport: "web", sourceIp: "203.0.113.55" } },
      ),
    );

    const rows = await testDb.appDb.execute<{
      action: string;
      resource_id: string | null;
      transport: string;
      source_ip: string | null;
      after: unknown;
    }>(
      sql`select action, resource_id, transport, source_ip, after from audit.audit_events where resource_id = ${result.id}`,
    );
    const materialized = Array.from(rows);

    expect(materialized).toHaveLength(1);
    expect(materialized[0]?.action).toBe("user.created");
    expect(materialized[0]?.transport).toBe("web");
    expect(materialized[0]?.source_ip).toBe("203.0.113.55");
    expect(JSON.stringify(materialized)).not.toContain(password);
  });

});
