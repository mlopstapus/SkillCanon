import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withTenantContext } from "@/shared/db/tenant-context";
import { NotAuthorizedError, type UserSummary } from "../domain/user";
import { createOrganization } from "./create-organization";
import { createTeam } from "./create-team";
import { insertValidatedUser } from "./insert-validated-user";
import { listUnassignedUsers } from "./list-unassigned-users";
import { removeTeamMember } from "./remove-team-member";

describe("listUnassignedUsers", () => {
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

  async function makeMember(orgId: string, teamId: string, displayName = "Member") {
    const { id } = await withTenantContext(testDb.appDb, orgId, (tx) =>
      insertValidatedUser(tx, {
        organizationId: orgId,
        teamId,
        username: `member-${randomUUID()}`,
        displayName,
        email: `member-${randomUUID()}@example.com`,
        password: "password123",
        role: "member",
      }),
    );
    return id;
  }

  it("lists every unassigned user in the caller's organization", async () => {
    const { org, team } = await makeOrgWithTeam("org-unassigned-list");
    const adminId = await makeMember(org.id, team.id, "Admin");
    const removedId = await makeMember(org.id, team.id, "Removed");
    const stillOnTeamId = await makeMember(org.id, team.id, "Still On Team");
    void stillOnTeamId;
    const admin: UserSummary = { id: adminId, orgId: org.id, teamId: team.id, role: "admin", email: "a@x.com" };

    await withTenantContext(testDb.appDb, org.id, (tx) => removeTeamMember(tx, admin, removedId));

    const unassigned = await withTenantContext(testDb.appDb, org.id, (tx) =>
      listUnassignedUsers(tx, admin),
    );

    expect(unassigned.map((u) => u.id)).toEqual([removedId]);
  });

  it("rejects a non-admin caller", async () => {
    const { org, team } = await makeOrgWithTeam("org-unassigned-nonadmin");
    const memberId = await makeMember(org.id, team.id);
    const member: UserSummary = { id: memberId, orgId: org.id, teamId: team.id, role: "member", email: "m@x.com" };

    await expect(
      withTenantContext(testDb.appDb, org.id, (tx) => listUnassignedUsers(tx, member)),
    ).rejects.toThrow(NotAuthorizedError);
  });

  it("never returns another organization's unassigned users", async () => {
    const { org: orgA, team: teamA } = await makeOrgWithTeam("org-unassigned-a");
    const { org: orgB, team: teamB } = await makeOrgWithTeam("org-unassigned-b");
    const adminAId = await makeMember(orgA.id, teamA.id, "Admin A");
    const adminA: UserSummary = { id: adminAId, orgId: orgA.id, teamId: teamA.id, role: "admin", email: "aa@x.com" };
    const removedBId = await makeMember(orgB.id, teamB.id, "Removed B");
    const adminBId = await makeMember(orgB.id, teamB.id, "Admin B");
    const adminB: UserSummary = { id: adminBId, orgId: orgB.id, teamId: teamB.id, role: "admin", email: "ab@x.com" };
    await withTenantContext(testDb.appDb, orgB.id, (tx) => removeTeamMember(tx, adminB, removedBId));

    const unassigned = await withTenantContext(testDb.appDb, orgA.id, (tx) =>
      listUnassignedUsers(tx, adminA),
    );

    expect(unassigned).toHaveLength(0);
  });
});
