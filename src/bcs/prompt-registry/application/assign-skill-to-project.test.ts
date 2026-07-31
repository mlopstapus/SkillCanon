import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import {
  DuplicateProjectSkillAssignmentError,
  PersonalSkillNotAssignableError,
  SkillNotEligibleForProjectError,
} from "../domain/project-skill-assignment";
import { addCollaboratorTeam } from "./add-collaborator-team";
import { assignSkillToProject } from "./assign-skill-to-project";
import { deprecatePrompt } from "./deprecate-prompt";
import {
  makeProjectTeamFixtureOrg,
  queryAuditEvents,
  queryProjectSkillAssignmentRows,
} from "./project-team-test-helpers";
import { createTestSkillOwnedByTeam, createTestSkillOwnedByUser } from "./subscription-test-helpers";

describe("assignSkillToProject", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("assigns a skill owned by the owner team as required, and records an audit event", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);
    const skill = await createTestSkillOwnedByTeam(testDb, fixture.organizationId, fixture.ownerTeamId);

    const assignment = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      assignSkillToProject(
        tx,
        fixture.ownerTeamAdmin,
        fixture.projectId,
        skill.id,
        { requirement: "required" },
        { transport: "api", sourceIp: "10.0.0.1" },
      ),
    );

    expect(assignment.projectId).toBe(fixture.projectId);
    expect(assignment.skillId).toBe(skill.id);
    expect(assignment.requirement).toBe("required");

    const rows = await queryProjectSkillAssignmentRows(testDb, sql`id = ${assignment.id}`);
    expect(rows).toHaveLength(1);

    const events = await queryAuditEvents(
      testDb,
      sql`action = 'project_skill_assignment.assigned' and resource_id = ${assignment.id}`,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.transport).toBe("api");
  });

  it("assigns a skill owned by a collaborator team as optional", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      addCollaboratorTeam(tx, fixture.ownerTeamAdmin, fixture.projectId, {
        teamId: fixture.collaboratorTeamId,
      }),
    );
    const skill = await createTestSkillOwnedByTeam(
      testDb,
      fixture.organizationId,
      fixture.collaboratorTeamId,
    );

    const assignment = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      assignSkillToProject(tx, fixture.ownerTeamAdmin, fixture.projectId, skill.id, {
        requirement: "optional",
      }),
    );

    expect(assignment.requirement).toBe("optional");
  });

  it("rejects a skill owned by a non-participating team, with no row or audit event", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);
    const skill = await createTestSkillOwnedByTeam(
      testDb,
      fixture.organizationId,
      fixture.nonParticipatingTeamId,
    );

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        assignSkillToProject(tx, fixture.ownerTeamAdmin, fixture.projectId, skill.id, {
          requirement: "required",
        }),
      ),
    ).rejects.toBeInstanceOf(SkillNotEligibleForProjectError);

    const rows = await queryProjectSkillAssignmentRows(
      testDb,
      sql`project_id = ${fixture.projectId} and skill_id = ${skill.id}`,
    );
    expect(rows).toHaveLength(0);
    const events = await queryAuditEvents(
      testDb,
      sql`action = 'project_skill_assignment.assigned' and organization_id = ${fixture.organizationId}`,
    );
    expect(events).toHaveLength(0);
  });

  it("rejects a personally-owned skill, even when the acting user owns it and administers the project", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);
    const skill = await createTestSkillOwnedByUser(
      testDb,
      fixture.organizationId,
      fixture.ownerTeamAdmin.id,
    );

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        assignSkillToProject(tx, fixture.ownerTeamAdmin, fixture.projectId, skill.id, {
          requirement: "required",
        }),
      ),
    ).rejects.toBeInstanceOf(PersonalSkillNotAssignableError);
  });

  it("rejects a duplicate assignment", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);
    const skill = await createTestSkillOwnedByTeam(testDb, fixture.organizationId, fixture.ownerTeamId);

    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      assignSkillToProject(tx, fixture.ownerTeamAdmin, fixture.projectId, skill.id, {
        requirement: "required",
      }),
    );

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        assignSkillToProject(tx, fixture.ownerTeamAdmin, fixture.projectId, skill.id, {
          requirement: "optional",
        }),
      ),
    ).rejects.toBeInstanceOf(DuplicateProjectSkillAssignmentError);
  });

  it("leaves the assignment untouched when the assigned skill is later deprecated (FR-017)", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);
    const skill = await createTestSkillOwnedByTeam(testDb, fixture.organizationId, fixture.ownerTeamId);

    const assignment = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      assignSkillToProject(tx, fixture.ownerTeamAdmin, fixture.projectId, skill.id, {
        requirement: "required",
      }),
    );

    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      deprecatePrompt(tx, { organizationId: fixture.organizationId, userId: fixture.ownerTeamAdmin.id }, skill.name),
    );

    const rows = await queryProjectSkillAssignmentRows(testDb, sql`id = ${assignment.id}`);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.requirement).toBe("required");
  });
});
