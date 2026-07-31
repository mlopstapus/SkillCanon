import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { ProjectNotFoundError } from "../domain/project";
import { addCollaboratorTeam } from "./add-collaborator-team";
import { listProjectsByTeam } from "./list-projects";
import { listProjectTeams } from "./list-project-teams";
import { makeProjectTeamFixtureOrg } from "./project-team-test-helpers";
import { removeCollaboratorTeam } from "./remove-collaborator-team";

describe("listProjectTeams", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("returns every current collaborator team, excluding the owner team itself", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      addCollaboratorTeam(tx, fixture.ownerTeamAdmin, fixture.projectId, {
        teamId: fixture.collaboratorTeamId,
      }),
    );

    const teams = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      listProjectTeams(tx, fixture.organizationId, fixture.projectId),
    );

    expect(teams.map((t) => t.teamId)).toEqual([fixture.collaboratorTeamId]);
    expect(teams.map((t) => t.teamId)).not.toContain(fixture.ownerTeamId);
  });

  it("excludes a removed collaborator", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      addCollaboratorTeam(tx, fixture.ownerTeamAdmin, fixture.projectId, {
        teamId: fixture.collaboratorTeamId,
      }),
    );
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      removeCollaboratorTeam(tx, fixture.ownerTeamAdmin, fixture.projectId, {
        teamId: fixture.collaboratorTeamId,
      }),
    );

    const teams = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      listProjectTeams(tx, fixture.organizationId, fixture.projectId),
    );

    expect(teams).toHaveLength(0);
  });

  it("rejects a nonexistent or cross-org project id", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);

    await expect(
      withTenantContext(testDb.appDb, fixture.otherOrgId, (tx) =>
        listProjectTeams(tx, fixture.otherOrgId, fixture.projectId),
      ),
    ).rejects.toBeInstanceOf(ProjectNotFoundError);
  });

  it("includes a project in listProjectsByTeam for a team that participates only as a collaborator (FR-024)", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      addCollaboratorTeam(tx, fixture.ownerTeamAdmin, fixture.projectId, {
        teamId: fixture.collaboratorTeamId,
      }),
    );

    const projects = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      listProjectsByTeam(tx, fixture.organizationId, fixture.collaboratorTeamId),
    );

    expect(projects.map((p) => p.id)).toContain(fixture.projectId);
  });

  it("does not include a project for a team that never participates in it", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);

    const projects = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      listProjectsByTeam(tx, fixture.organizationId, fixture.nonParticipatingTeamId),
    );

    expect(projects.map((p) => p.id)).not.toContain(fixture.projectId);
  });
});
