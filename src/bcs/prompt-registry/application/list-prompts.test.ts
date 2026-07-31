import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { insertPrompt } from "../infrastructure/prompts-repo";
import { addCollaboratorTeam } from "./add-collaborator-team";
import { addProjectMember } from "./add-project-member";
import { assignSkillToProject } from "./assign-skill-to-project";
import { listPrompts } from "./list-prompts";
import { makeProjectTeamFixtureOrg } from "./project-team-test-helpers";
import { subscribeSkill } from "./subscribe-skill";
import { createTestSkillOwnedByTeam, createTestSkillOwnedByUser, makeSubscriptionFixtureOrg } from "./subscription-test-helpers";

describe("listPrompts (the accessible set)", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("includes skills the caller owns", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const owned = await createTestSkillOwnedByUser(testDb, fixture.organizationId, fixture.userA.id);

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      listPrompts(tx, { organizationId: fixture.organizationId, userId: fixture.userA.id }),
    );

    expect(result.map((p) => p.id)).toContain(owned.id);
  });

  it("includes skills the caller's own team owns", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    // team1Owner's team_id is team1Id (subscription-test-helpers assigns
    // every user a team_id at creation).
    const teamOwned = await createTestSkillOwnedByTeam(testDb, fixture.organizationId, fixture.team1Id);

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      listPrompts(tx, { organizationId: fixture.organizationId, userId: fixture.team1Owner.id }),
    );

    expect(result.map((p) => p.id)).toContain(teamOwned.id);
  });

  it("includes skills the caller subscribes to", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByUser(testDb, fixture.organizationId, fixture.userA.id);
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      subscribeSkill(tx, fixture.userB, source.id, {
        subscriberType: "user",
        subscriberId: fixture.userB.id,
      }),
    );

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      listPrompts(tx, { organizationId: fixture.organizationId, userId: fixture.userB.id }),
    );

    expect(result.map((p) => p.id)).toContain(source.id);
  });

  it("includes skills the caller's own team subscribes to", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByUser(testDb, fixture.organizationId, fixture.userA.id);
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      subscribeSkill(tx, fixture.team1Owner, source.id, {
        subscriberType: "team",
        subscriberId: fixture.team1Id,
      }),
    );

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      listPrompts(tx, { organizationId: fixture.organizationId, userId: fixture.team1Owner.id }),
    );

    expect(result.map((p) => p.id)).toContain(source.id);
  });

  it("excludes a same-org skill the caller neither owns, nor their team owns, nor subscribes to (FR-014)", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    // Owned by team2, which userB (on team2's own roster is userB — but
    // userB is not team2's owner and has not subscribed) has no
    // relationship to for accessible-set purposes beyond team ownership.
    const unrelated = await createTestSkillOwnedByUser(testDb, fixture.organizationId, fixture.userA.id);

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      listPrompts(tx, { organizationId: fixture.organizationId, userId: fixture.userB.id }),
    );

    expect(result.map((p) => p.id)).not.toContain(unrelated.id);
  });

  it("excludes a different organization's skill even where an id happens to coincide (FR-015)", async () => {
    const fixtureA = await makeSubscriptionFixtureOrg(testDb);
    const fixtureB = await makeSubscriptionFixtureOrg(testDb);

    // Deliberately reuse fixtureA.userA's id as the owner of a skill in
    // organization B — an id coincidence that must not leak across the
    // organization boundary.
    const coincidentalId = await withTenantContext(testDb.appDb, fixtureB.organizationId, (tx) =>
      insertPrompt(tx, {
        id: randomUUID(),
        organizationId: fixtureB.organizationId,
        name: `coincidental-${randomUUID()}`,
        description: null,
        isDeprecated: false,
        activeVersionId: null,
        ownerType: "user",
        ownerId: fixtureA.userA.id,
        forkedFromSkillId: null,
      }),
    );

    const result = await withTenantContext(testDb.appDb, fixtureA.organizationId, (tx) =>
      listPrompts(tx, { organizationId: fixtureA.organizationId, userId: fixtureA.userA.id }),
    );

    expect(result.map((p) => p.id)).not.toContain(coincidentalId.id);
  });

  describe("with a projectId filter (022-project-skill-assignment)", () => {
    it("includes a collaborator-team-contributed assigned skill for a member who only belongs to the owner team", async () => {
      const fixture = await makeProjectTeamFixtureOrg(testDb);
      await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        addCollaboratorTeam(tx, fixture.ownerTeamAdmin, fixture.projectId, {
          teamId: fixture.collaboratorTeamId,
        }),
      );
      const assignedSkill = await createTestSkillOwnedByTeam(
        testDb,
        fixture.organizationId,
        fixture.collaboratorTeamId,
        "assigned-via-collaborator",
      );
      await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        assignSkillToProject(tx, fixture.ownerTeamAdmin, fixture.projectId, assignedSkill.id, {
          requirement: "required",
        }),
      );
      await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        addProjectMember(
          tx,
          { organizationId: fixture.organizationId, userId: fixture.ownerTeamAdmin.id },
          { projectId: fixture.projectId, userId: fixture.nonAdminMember.id },
          {
            organizationExists: async () => true,
            teamBelongsToOrganization: async () => true,
            userBelongsToOrganization: async () => true,
          },
        ),
      );

      const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        listPrompts(
          tx,
          { organizationId: fixture.organizationId, userId: fixture.nonAdminMember.id },
          { projectId: fixture.projectId },
        ),
      );

      expect(result.map((p) => p.id)).toContain(assignedSkill.id);
    });

    it("excludes a collaborator-team skill that was never assigned to the project, even with the projectId filter", async () => {
      const fixture = await makeProjectTeamFixtureOrg(testDb);
      await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        addCollaboratorTeam(tx, fixture.ownerTeamAdmin, fixture.projectId, {
          teamId: fixture.collaboratorTeamId,
        }),
      );
      const unassignedSkill = await createTestSkillOwnedByTeam(
        testDb,
        fixture.organizationId,
        fixture.collaboratorTeamId,
        "never-assigned",
      );
      await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        addProjectMember(
          tx,
          { organizationId: fixture.organizationId, userId: fixture.ownerTeamAdmin.id },
          { projectId: fixture.projectId, userId: fixture.nonAdminMember.id },
          {
            organizationExists: async () => true,
            teamBelongsToOrganization: async () => true,
            userBelongsToOrganization: async () => true,
          },
        ),
      );

      const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        listPrompts(
          tx,
          { organizationId: fixture.organizationId, userId: fixture.nonAdminMember.id },
          { projectId: fixture.projectId },
        ),
      );

      expect(result.map((p) => p.id)).not.toContain(unassignedSkill.id);
    });

    it("silently ignores projectId for a caller who is not a project member", async () => {
      const fixture = await makeProjectTeamFixtureOrg(testDb);
      // Owned by the *collaborator* team, not the owner team `nonAdminMember`
      // belongs to — isolates the projectId filter from ordinary
      // team-based accessibility (a skill owned by the owner team would
      // already be accessible to nonAdminMember regardless of projectId).
      await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        addCollaboratorTeam(tx, fixture.ownerTeamAdmin, fixture.projectId, {
          teamId: fixture.collaboratorTeamId,
        }),
      );
      const assignedSkill = await createTestSkillOwnedByTeam(
        testDb,
        fixture.organizationId,
        fixture.collaboratorTeamId,
        "assigned-not-a-member",
      );
      await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        assignSkillToProject(tx, fixture.ownerTeamAdmin, fixture.projectId, assignedSkill.id, {
          requirement: "required",
        }),
      );

      const withoutProjectId = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        listPrompts(tx, { organizationId: fixture.organizationId, userId: fixture.nonAdminMember.id }),
      );
      const withProjectId = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        listPrompts(
          tx,
          { organizationId: fixture.organizationId, userId: fixture.nonAdminMember.id },
          { projectId: fixture.projectId },
        ),
      );

      expect(withProjectId.map((p) => p.id)).not.toContain(assignedSkill.id);
      expect(withProjectId.map((p) => p.id).sort()).toEqual(withoutProjectId.map((p) => p.id).sort());
    });
  });
});
