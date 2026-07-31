import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { CollaboratorTeamNotFoundError } from "../domain/project-team";
import { SubscriberNotAuthorizedError } from "../domain/subscription";
import { addCollaboratorTeam } from "./add-collaborator-team";
import {
  makeProjectTeamFixtureOrg,
  queryAuditEvents,
  queryProjectTeamRows,
} from "./project-team-test-helpers";
import { removeCollaboratorTeam } from "./remove-collaborator-team";

describe("removeCollaboratorTeam", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("owner-team admin removes an existing collaborator and records a project_team.removed audit event", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);
    const added = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      addCollaboratorTeam(tx, fixture.ownerTeamAdmin, fixture.projectId, {
        teamId: fixture.collaboratorTeamId,
      }),
    );

    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      removeCollaboratorTeam(
        tx,
        fixture.ownerTeamAdmin,
        fixture.projectId,
        { teamId: fixture.collaboratorTeamId },
        { transport: "api", sourceIp: "10.0.0.1" },
      ),
    );

    const rows = await queryProjectTeamRows(testDb, sql`id = ${added.id}`);
    expect(rows).toHaveLength(0);

    const events = await queryAuditEvents(
      testDb,
      sql`action = 'project_team.removed' and resource_id = ${added.id}`,
    );
    expect(events).toHaveLength(1);
  });

  it("rejects a non-admin, non-owner caller", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      addCollaboratorTeam(tx, fixture.ownerTeamAdmin, fixture.projectId, {
        teamId: fixture.collaboratorTeamId,
      }),
    );

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        removeCollaboratorTeam(tx, fixture.nonAdminMember, fixture.projectId, {
          teamId: fixture.collaboratorTeamId,
        }),
      ),
    ).rejects.toBeInstanceOf(SubscriberNotAuthorizedError);

    const rows = await queryProjectTeamRows(
      testDb,
      sql`project_id = ${fixture.projectId} and team_id = ${fixture.collaboratorTeamId}`,
    );
    expect(rows).toHaveLength(1);
  });

  it("rejects removing a team that was never a collaborator, with no side effects", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        removeCollaboratorTeam(tx, fixture.ownerTeamAdmin, fixture.projectId, {
          teamId: fixture.nonParticipatingTeamId,
        }),
      ),
    ).rejects.toBeInstanceOf(CollaboratorTeamNotFoundError);

    const events = await queryAuditEvents(
      testDb,
      sql`action = 'project_team.removed' and organization_id = ${fixture.organizationId}`,
    );
    expect(events).toHaveLength(0);
  });
});
