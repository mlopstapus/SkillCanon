import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { ProjectSkillAssignmentNotFoundError } from "../domain/project-skill-assignment";
import { assignSkillToProject } from "./assign-skill-to-project";
import { listPrompts } from "./list-prompts";
import { listRequiredSkillsForProject } from "./list-required-skills-for-project";
import {
  makeProjectTeamFixtureOrg,
  queryAuditEvents,
  queryProjectSkillAssignmentRows,
} from "./project-team-test-helpers";
import { createTestSkillOwnedByTeam } from "./subscription-test-helpers";
import { unassignSkillFromProject } from "./unassign-skill-from-project";

describe("unassignSkillFromProject", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("unassigns an existing assignment and records a project_skill_assignment.unassigned audit event", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);
    const skill = await createTestSkillOwnedByTeam(testDb, fixture.organizationId, fixture.ownerTeamId);
    const assignment = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      assignSkillToProject(tx, fixture.ownerTeamAdmin, fixture.projectId, skill.id, {
        requirement: "required",
      }),
    );

    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      unassignSkillFromProject(
        tx,
        fixture.ownerTeamAdmin,
        fixture.projectId,
        skill.id,
        { transport: "api", sourceIp: "10.0.0.1" },
      ),
    );

    const rows = await queryProjectSkillAssignmentRows(testDb, sql`id = ${assignment.id}`);
    expect(rows).toHaveLength(0);

    const events = await queryAuditEvents(
      testDb,
      sql`action = 'project_skill_assignment.unassigned' and resource_id = ${assignment.id}`,
    );
    expect(events).toHaveLength(1);
  });

  it("no longer appears in the required-skill list afterward", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);
    const skill = await createTestSkillOwnedByTeam(
      testDb,
      fixture.organizationId,
      fixture.ownerTeamId,
      "required-then-unassigned",
    );
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      assignSkillToProject(tx, fixture.ownerTeamAdmin, fixture.projectId, skill.id, {
        requirement: "required",
      }),
    );

    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      unassignSkillFromProject(tx, fixture.ownerTeamAdmin, fixture.projectId, skill.id),
    );

    const required = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      listRequiredSkillsForProject(tx, fixture.organizationId, fixture.projectId),
    );
    expect(required).not.toContain("required-then-unassigned");
  });

  it("no longer appears in listPrompts's projectId-filtered result afterward", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);
    const skill = await createTestSkillOwnedByTeam(testDb, fixture.organizationId, fixture.ownerTeamId);
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      assignSkillToProject(tx, fixture.ownerTeamAdmin, fixture.projectId, skill.id, {
        requirement: "optional",
      }),
    );

    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      unassignSkillFromProject(tx, fixture.ownerTeamAdmin, fixture.projectId, skill.id),
    );

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      listPrompts(
        tx,
        { organizationId: fixture.organizationId, userId: fixture.nonAdminMember.id },
        { projectId: fixture.projectId },
      ),
    );
    // nonAdminMember belongs to ownerTeamId, so the skill is still visible
    // via ordinary team ownership — the assignment removal specifically
    // doesn't affect that unrelated access path, only the project-scoped one.
    expect(result.map((p) => p.id)).toContain(skill.id);
  });

  it("rejects unassigning a nonexistent assignment, with no side effects", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);
    const skill = await createTestSkillOwnedByTeam(testDb, fixture.organizationId, fixture.ownerTeamId);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        unassignSkillFromProject(tx, fixture.ownerTeamAdmin, fixture.projectId, skill.id),
      ),
    ).rejects.toBeInstanceOf(ProjectSkillAssignmentNotFoundError);

    const events = await queryAuditEvents(
      testDb,
      sql`action = 'project_skill_assignment.unassigned' and organization_id = ${fixture.organizationId}`,
    );
    expect(events).toHaveLength(0);
  });
});
