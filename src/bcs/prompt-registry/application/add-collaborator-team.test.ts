import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import {
  DuplicateCollaboratorTeamError,
  OwnerTeamCannotBeCollaboratorError,
  ProjectTeamOrgMismatchError,
} from "../domain/project-team";
import { SubscriberNotAuthorizedError } from "../domain/subscription";
import { addCollaboratorTeam } from "./add-collaborator-team";
import {
  makeProjectTeamFixtureOrg,
  queryAuditEvents,
  queryProjectTeamRows,
} from "./project-team-test-helpers";

describe("addCollaboratorTeam", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("owner-team admin adds a same-org team as a collaborator and records a project_team.added audit event", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      addCollaboratorTeam(
        tx,
        fixture.ownerTeamAdmin,
        fixture.projectId,
        { teamId: fixture.collaboratorTeamId },
        { transport: "api", sourceIp: "10.0.0.1" },
      ),
    );

    expect(result.projectId).toBe(fixture.projectId);
    expect(result.teamId).toBe(fixture.collaboratorTeamId);

    const rows = await queryProjectTeamRows(testDb, sql`id = ${result.id}`);
    expect(rows).toHaveLength(1);

    const events = await queryAuditEvents(
      testDb,
      sql`action = 'project_team.added' and resource_id = ${result.id}`,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.transport).toBe("api");
  });

  it("rejects a non-admin, non-owner caller", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        addCollaboratorTeam(tx, fixture.nonAdminMember, fixture.projectId, {
          teamId: fixture.collaboratorTeamId,
        }),
      ),
    ).rejects.toBeInstanceOf(SubscriberNotAuthorizedError);

    const rows = await queryProjectTeamRows(
      testDb,
      sql`project_id = ${fixture.projectId} and team_id = ${fixture.collaboratorTeamId}`,
    );
    expect(rows).toHaveLength(0);
  });

  it("rejects a team from a different organization, with no row or audit event", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        addCollaboratorTeam(tx, fixture.ownerTeamAdmin, fixture.projectId, {
          teamId: fixture.otherOrgTeamId,
        }),
      ),
    ).rejects.toBeInstanceOf(ProjectTeamOrgMismatchError);

    const rows = await queryProjectTeamRows(
      testDb,
      sql`project_id = ${fixture.projectId} and team_id = ${fixture.otherOrgTeamId}`,
    );
    expect(rows).toHaveLength(0);
    const events = await queryAuditEvents(
      testDb,
      sql`action = 'project_team.added' and resource_id in (select id from prompt_registry.project_teams where team_id = ${fixture.otherOrgTeamId})`,
    );
    expect(events).toHaveLength(0);
  });

  it("rejects adding the project's own owner team as its collaborator", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        addCollaboratorTeam(tx, fixture.ownerTeamAdmin, fixture.projectId, {
          teamId: fixture.ownerTeamId,
        }),
      ),
    ).rejects.toBeInstanceOf(OwnerTeamCannotBeCollaboratorError);
  });

  it("rejects a duplicate collaborator-team add", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);

    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      addCollaboratorTeam(tx, fixture.ownerTeamAdmin, fixture.projectId, {
        teamId: fixture.collaboratorTeamId,
      }),
    );

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        addCollaboratorTeam(tx, fixture.ownerTeamAdmin, fixture.projectId, {
          teamId: fixture.collaboratorTeamId,
        }),
      ),
    ).rejects.toBeInstanceOf(DuplicateCollaboratorTeamError);
  });
});
