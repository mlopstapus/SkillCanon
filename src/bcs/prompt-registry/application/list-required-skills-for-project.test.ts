import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { addCollaboratorTeam } from "./add-collaborator-team";
import { assignSkillToProject } from "./assign-skill-to-project";
import { listRequiredSkillsForProject } from "./list-required-skills-for-project";
import { makeProjectTeamFixtureOrg } from "./project-team-test-helpers";
import { createTestSkillOwnedByTeam } from "./subscription-test-helpers";

describe("listRequiredSkillsForProject", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("returns only required-marked skill names, excluding optional ones", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);
    const requiredSkill = await createTestSkillOwnedByTeam(
      testDb,
      fixture.organizationId,
      fixture.ownerTeamId,
      "required-skill",
    );
    const optionalSkill = await createTestSkillOwnedByTeam(
      testDb,
      fixture.organizationId,
      fixture.ownerTeamId,
      "optional-skill",
    );

    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      assignSkillToProject(tx, fixture.ownerTeamAdmin, fixture.projectId, requiredSkill.id, {
        requirement: "required",
      }),
    );
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      assignSkillToProject(tx, fixture.ownerTeamAdmin, fixture.projectId, optionalSkill.id, {
        requirement: "optional",
      }),
    );

    const required = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      listRequiredSkillsForProject(tx, fixture.organizationId, fixture.projectId),
    );

    expect(required).toEqual(["required-skill"]);
  });

  it("returns an empty list for a project with no assignments, not an error", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);

    const required = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      listRequiredSkillsForProject(tx, fixture.organizationId, fixture.projectId),
    );

    expect(required).toEqual([]);
  });

  it("includes a required skill contributed by a collaborator team the same as one from the owner team", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      addCollaboratorTeam(tx, fixture.ownerTeamAdmin, fixture.projectId, {
        teamId: fixture.collaboratorTeamId,
      }),
    );
    const collaboratorSkill = await createTestSkillOwnedByTeam(
      testDb,
      fixture.organizationId,
      fixture.collaboratorTeamId,
      "collaborator-required-skill",
    );
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      assignSkillToProject(tx, fixture.ownerTeamAdmin, fixture.projectId, collaboratorSkill.id, {
        requirement: "required",
      }),
    );

    const required = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      listRequiredSkillsForProject(tx, fixture.organizationId, fixture.projectId),
    );

    expect(required).toEqual(["collaborator-required-skill"]);
  });
});
