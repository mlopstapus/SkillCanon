import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withTenantContext } from "@/shared/db/tenant-context";
import type { UserSummary } from "../domain/user";
import { NotAuthorizedError } from "../domain/user";
import { DuplicateTeamSlugError } from "../domain/team";
import { createOrganization } from "./create-organization";
import { createTeam } from "./create-team";
import { insertValidatedUser } from "./insert-validated-user";
import { updateTeam } from "./update-team";
import { teams } from "../infrastructure/schema";

function fakeUser(orgId: string, role: "admin" | "member"): UserSummary {
  return { id: randomUUID(), orgId, teamId: null, role, email: "acting@example.com" };
}

describe("updateTeam", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  beforeEach(() => {
    vi.stubEnv("STRIPE_ENABLED", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    await testDb.teardown();
  });

  it("updates name, description, and owner without touching hierarchy position", async () => {
    const org = await testDb.authDb.transaction((tx) =>
      createOrganization(tx, { name: "org-update", slug: `org-update-${randomUUID()}` }),
    );
    const parent = await withTenantContext(testDb.appDb, org.id, (tx) =>
      createTeam(tx, { organizationId: org.id, name: "Parent", slug: "parent" }),
    );
    const child = await withTenantContext(testDb.appDb, org.id, (tx) =>
      createTeam(tx, {
        organizationId: org.id,
        name: "Child",
        slug: "child",
        parentTeamId: parent.id,
      }),
    );
    // `owner_id` FK's referenced table (`identity_access.users`) didn't
    // exist when this test was originally written — a real user row is now
    // required (007-user-accounts-registration completes the FK).
    const { id: newOwnerId } = await withTenantContext(testDb.appDb, org.id, (tx) =>
      insertValidatedUser(tx, {
        organizationId: org.id,
        teamId: child.id,
        username: `owner-${randomUUID()}`,
        displayName: "New Owner",
        email: `owner-${randomUUID()}@example.com`,
        password: "password123",
        role: "member",
      }),
    );

    await withTenantContext(testDb.appDb, org.id, (tx) =>
      updateTeam(
        tx,
        org.id,
        child.id,
        {
          name: "Renamed Child",
          description: "new description",
          ownerId: newOwnerId,
        },
        fakeUser(org.id, "admin"),
      ),
    );

    const [row] = await withTenantContext(testDb.appDb, org.id, (tx) =>
      tx.select().from(teams).where(eq(teams.id, child.id)),
    );
    expect(row?.name).toBe("Renamed Child");
    expect(row?.description).toBe("new description");
    expect(row?.ownerId).toBe(newOwnerId);
    expect(row?.parentTeamId).toBe(parent.id);
  });

  it("rejects a teamId belonging to a different organization, changing nothing (M1/M3)", async () => {
    const orgA = await testDb.authDb.transaction((tx) =>
      createOrganization(tx, { name: "org-update-a", slug: `org-update-a-${randomUUID()}` }),
    );
    const orgB = await testDb.authDb.transaction((tx) =>
      createOrganization(tx, { name: "org-update-b", slug: `org-update-b-${randomUUID()}` }),
    );
    const teamInB = await withTenantContext(testDb.appDb, orgB.id, (tx) =>
      createTeam(tx, { organizationId: orgB.id, name: "B Team", slug: "b-team" }),
    );

    await expect(
      withTenantContext(testDb.appDb, orgA.id, (tx) =>
        updateTeam(tx, orgA.id, teamInB.id, { name: "Hijacked" }, fakeUser(orgA.id, "admin")),
      ),
    ).rejects.toThrow();

    const [row] = await withTenantContext(testDb.appDb, orgB.id, (tx) =>
      tx.select().from(teams).where(eq(teams.id, teamInB.id)),
    );
    expect(row?.name).toBe("B Team");
  });

  it("rejects a non-admin actingUser (019-account-team-settings-ui)", async () => {
    const org = await testDb.authDb.transaction((tx) =>
      createOrganization(tx, { name: "org-update-nonadmin", slug: `org-update-nonadmin-${randomUUID()}` }),
    );
    const team = await withTenantContext(testDb.appDb, org.id, (tx) =>
      createTeam(tx, { organizationId: org.id, name: "Team", slug: "team" }),
    );

    await expect(
      withTenantContext(testDb.appDb, org.id, (tx) =>
        updateTeam(tx, org.id, team.id, { name: "Renamed" }, fakeUser(org.id, "member")),
      ),
    ).rejects.toThrow(NotAuthorizedError);
  });

  it("rejects a slug that collides with another team in the same organization", async () => {
    const org = await testDb.authDb.transaction((tx) =>
      createOrganization(tx, { name: "org-update-dupslug", slug: `org-update-dupslug-${randomUUID()}` }),
    );
    await withTenantContext(testDb.appDb, org.id, (tx) =>
      createTeam(tx, { organizationId: org.id, name: "First", slug: "taken" }),
    );
    const second = await withTenantContext(testDb.appDb, org.id, (tx) =>
      createTeam(tx, { organizationId: org.id, name: "Second", slug: "not-taken-yet" }),
    );

    await expect(
      withTenantContext(testDb.appDb, org.id, (tx) =>
        updateTeam(tx, org.id, second.id, { slug: "taken" }, fakeUser(org.id, "admin")),
      ),
    ).rejects.toThrow(DuplicateTeamSlugError);
  });

  it("records exactly one team.updated audit event on success", async () => {
    const org = await testDb.authDb.transaction((tx) =>
      createOrganization(tx, { name: "org-update-audit", slug: `org-update-audit-${randomUUID()}` }),
    );
    const team = await withTenantContext(testDb.appDb, org.id, (tx) =>
      createTeam(tx, { organizationId: org.id, name: "Before", slug: "before" }),
    );

    await withTenantContext(testDb.appDb, org.id, (tx) =>
      updateTeam(
        tx,
        org.id,
        team.id,
        { name: "After" },
        fakeUser(org.id, "admin"),
        { auditContext: { transport: "web", sourceIp: "203.0.113.44" } },
      ),
    );

    const rows = await withTenantContext(testDb.appDb, org.id, (tx) =>
      tx.execute<{
        action: string;
        resource_id: string | null;
        transport: string;
        source_ip: string | null;
      }>(
        sql`select action, resource_id, transport, source_ip from audit.audit_events where resource_id = ${team.id} and action = 'team.updated'`,
      ),
    );

    expect(Array.from(rows)).toEqual([
      {
        action: "team.updated",
        resource_id: team.id,
        transport: "web",
        source_ip: "203.0.113.44",
      },
    ]);
  });

});
