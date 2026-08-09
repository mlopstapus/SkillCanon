import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withTenantContext } from "@/shared/db/tenant-context";
import { CrossOrgUserAccessError, NotAuthorizedError, type UserSummary } from "../domain/user";
import { findById } from "../infrastructure/users-repo";
import { createOrganization } from "./create-organization";
import { createTeam } from "./create-team";
import { insertValidatedUser } from "./insert-validated-user";
import { removeTeamMember } from "./remove-team-member";
import { updateTeam } from "./update-team";

describe("removeTeamMember", () => {
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

  async function makeOrgWithTeam(name: string) {
    const org = await testDb.authDb.transaction((tx) =>
      createOrganization(tx, { name, slug: `${name}-${randomUUID()}` }),
    );
    const team = await withTenantContext(testDb.appDb, org.id, (tx) =>
      createTeam(tx, { organizationId: org.id, name: "Team", slug: `team-${randomUUID()}` }),
    );
    return { org, team };
  }

  async function makeMember(orgId: string, teamId: string) {
    const { id } = await withTenantContext(testDb.appDb, orgId, (tx) =>
      insertValidatedUser(tx, {
        organizationId: orgId,
        teamId,
        username: `member-${randomUUID()}`,
        displayName: "Member",
        email: `member-${randomUUID()}@example.com`,
        password: "password123",
        role: "member",
      }),
    );
    return id;
  }

  it("an org admin removes a member from any team, unassigning them (019-account-team-settings-ui)", async () => {
    const { org, team } = await makeOrgWithTeam("org-remove-admin");
    const targetId = await makeMember(org.id, team.id);
    const adminId = await makeMember(org.id, team.id);
    const admin: UserSummary = { id: adminId, orgId: org.id, teamId: team.id, role: "admin", email: "a@x.com" };

    await withTenantContext(testDb.appDb, org.id, (tx) => removeTeamMember(tx, admin, targetId));

    const row = await withTenantContext(testDb.appDb, org.id, (tx) => findById(tx, targetId));
    expect(row?.teamId).toBeNull();
  });

  it("the team's own owner (non-admin) can remove a member of that team", async () => {
    const { org, team } = await makeOrgWithTeam("org-remove-owner");
    const ownerId = await makeMember(org.id, team.id);
    const targetId = await makeMember(org.id, team.id);
    await withTenantContext(testDb.appDb, org.id, (tx) =>
      updateTeam(tx, org.id, team.id, { ownerId }, {
        id: ownerId,
        orgId: org.id,
        teamId: team.id,
        role: "admin",
        email: "bootstrap@x.com",
      }),
    );
    const owner: UserSummary = { id: ownerId, orgId: org.id, teamId: team.id, role: "member", email: "o@x.com" };

    await withTenantContext(testDb.appDb, org.id, (tx) => removeTeamMember(tx, owner, targetId));

    const row = await withTenantContext(testDb.appDb, org.id, (tx) => findById(tx, targetId));
    expect(row?.teamId).toBeNull();
  });

  it("rejects a caller who is neither an admin nor the team's owner", async () => {
    const { org, team } = await makeOrgWithTeam("org-remove-forbidden");
    const targetId = await makeMember(org.id, team.id);
    const bystanderId = await makeMember(org.id, team.id);
    const bystander: UserSummary = {
      id: bystanderId,
      orgId: org.id,
      teamId: team.id,
      role: "member",
      email: "b@x.com",
    };

    await expect(
      withTenantContext(testDb.appDb, org.id, (tx) => removeTeamMember(tx, bystander, targetId)),
    ).rejects.toThrow(NotAuthorizedError);
  });

  it("rejects a target user in a different organization (M3)", async () => {
    const { org: orgA } = await makeOrgWithTeam("org-remove-a");
    const { org: orgB, team: teamB } = await makeOrgWithTeam("org-remove-b");
    const targetId = await makeMember(orgB.id, teamB.id);
    const admin: UserSummary = {
      id: randomUUID(),
      orgId: orgA.id,
      teamId: null,
      role: "admin",
      email: "a@x.com",
    };

    await expect(
      withTenantContext(testDb.appDb, orgA.id, (tx) => removeTeamMember(tx, admin, targetId)),
    ).rejects.toThrow(CrossOrgUserAccessError);
  });

  it("records a user.updated audit event with teamId going to null", async () => {
    const { org, team } = await makeOrgWithTeam("org-remove-audit");
    const targetId = await makeMember(org.id, team.id);
    const adminId = await makeMember(org.id, team.id);
    const admin: UserSummary = { id: adminId, orgId: org.id, teamId: team.id, role: "admin", email: "a@x.com" };

    await withTenantContext(testDb.appDb, org.id, (tx) => removeTeamMember(tx, admin, targetId));

    const rows = await withTenantContext(testDb.appDb, org.id, (tx) =>
      tx.execute<{ action: string; resource_id: string | null }>(
        sql`select action, resource_id from audit.audit_events where resource_id = ${targetId} and action = 'user.updated'`,
      ),
    );
    expect(Array.from(rows).length).toBeGreaterThanOrEqual(1);
  });
});
