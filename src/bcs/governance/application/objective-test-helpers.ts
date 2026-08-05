import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { withTenantContext } from "@/shared/db/tenant-context";
import type { TestDb } from "@/shared/db/test-helpers";
import type { ObjectiveActor, ObjectiveScopeVerifier } from "../domain/objective";
import { createObjective } from "./create-objective";

export interface ObjectiveFixtureOrg {
  organizationId: string;
  actor: ObjectiveActor;
  teamId: string;
  projectId: string;
  userId: string;
}

/** fixture.actor is org 'admin' (031-governance-views-ui) so it satisfies assertCanManageObjective's authorization rule for both team- and user-scoped objectives by default. */
export async function makeObjectiveFixtureOrg(testDb: TestDb): Promise<ObjectiveFixtureOrg> {
  const organizationId = randomUUID();
  const teamId = randomUUID();
  const userId = randomUUID();
  const projectId = randomUUID();
  const slug = `org-${randomUUID()}`;
  const teamSlug = `team-${randomUUID()}`;
  const email = `${randomUUID()}@example.com`;
  const username = `user-${randomUUID()}`;

  await testDb.ownerDb.execute(sql`
    insert into identity_access.organizations (id, name, slug)
    values (${organizationId}, ${`Org ${slug}`}, ${slug})
  `);
  await testDb.ownerDb.execute(sql`
    insert into identity_access.teams (id, organization_id, name, slug)
    values (${teamId}, ${organizationId}, 'Root', ${teamSlug})
  `);
  await testDb.ownerDb.execute(sql`
    insert into identity_access.users (id, organization_id, team_id, username, display_name, email, role, is_active)
    values (${userId}, ${organizationId}, ${teamId}, ${username}, 'Test User', ${email}, 'admin', true)
  `);

  return {
    organizationId,
    actor: { organizationId, userId },
    teamId,
    projectId,
    userId,
  };
}

export function makeObjectiveScopeVerifier(
  scopes: Array<{ id: string; organizationId: string }>,
): ObjectiveScopeVerifier {
  const byId = new Map(scopes.map((scope) => [scope.id, scope.organizationId]));
  return {
    teamBelongsToOrganization: async (organizationId, teamId) => byId.get(teamId) === organizationId,
    projectBelongsToOrganization: async (organizationId, projectId) =>
      byId.get(projectId) === organizationId,
    userBelongsToOrganization: async (organizationId, userId) => byId.get(userId) === organizationId,
  };
}

export function makeVerifierForFixture(fixture: ObjectiveFixtureOrg): ObjectiveScopeVerifier {
  return makeObjectiveScopeVerifier([
    { id: fixture.teamId, organizationId: fixture.organizationId },
    { id: fixture.projectId, organizationId: fixture.organizationId },
    { id: fixture.userId, organizationId: fixture.organizationId },
  ]);
}

export async function createTestObjective(
  testDb: TestDb,
  fixture: ObjectiveFixtureOrg,
  overrides: Partial<Parameters<typeof createObjective>[2]> = {},
) {
  return withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
    createObjective(
      tx,
      fixture.actor,
      {
        teamId: fixture.teamId,
        title: `Objective ${randomUUID()}`,
        description: null,
        ...overrides,
      },
      makeVerifierForFixture(fixture),
    ),
  );
}

export async function countObjectives(testDb: TestDb): Promise<number> {
  const rows = await testDb.ownerDb.execute<{ count: number | string }>(
    sql`select count(*)::int as count from governance.objectives`,
  );
  return Number(rows[0]?.count ?? 0);
}

export async function queryObjectiveRows(
  testDb: TestDb,
  whereSql: ReturnType<typeof sql>,
): Promise<Array<Record<string, unknown>>> {
  const rows = await testDb.ownerDb.execute<Record<string, unknown>>(
    sql`select * from governance.objectives where ${whereSql}`,
  );
  return Array.from(rows);
}

export async function queryObjectiveAuditEvents(
  testDb: TestDb,
  whereSql: ReturnType<typeof sql>,
): Promise<Array<{ action: string; resource_id: string | null; transport: string; source_ip: string | null }>> {
  const rows = await testDb.appDb.execute<{
    action: string;
    resource_id: string | null;
    transport: string;
    source_ip: string | null;
  }>(
    sql`select action, resource_id, transport, source_ip from audit.audit_events where ${whereSql}`,
  );
  return Array.from(rows);
}


export async function createObjectiveFixtureTeam(
  testDb: TestDb,
  fixture: ObjectiveFixtureOrg,
  params: { parentTeamId?: string | null; name?: string } = {},
): Promise<string> {
  const teamId = randomUUID();
  await testDb.ownerDb.execute(sql`
    insert into identity_access.teams (id, organization_id, name, slug, parent_team_id)
    values (
      ${teamId},
      ${fixture.organizationId},
      ${params.name ?? `Team ${teamId}`},
      ${`team-${randomUUID()}`},
      ${params.parentTeamId ?? null}
    )
  `);
  return teamId;
}

export async function createObjectiveFixtureUser(
  testDb: TestDb,
  fixture: ObjectiveFixtureOrg,
  teamId: string,
): Promise<string> {
  const userId = randomUUID();
  await testDb.ownerDb.execute(sql`
    insert into identity_access.users (id, organization_id, team_id, username, display_name, email, role, is_active)
    values (
      ${userId},
      ${fixture.organizationId},
      ${teamId},
      ${`user-${randomUUID()}`},
      'Fixture User',
      ${`${randomUUID()}@example.com`},
      'member',
      true
    )
  `);
  return userId;
}

export async function insertObjectiveRow(
  testDb: TestDb,
  params: {
    organizationId: string;
    teamId?: string | null;
    projectId?: string | null;
    userId?: string | null;
    title: string;
    status?: string;
    createdAt?: Date;
    parentObjectiveId?: string | null;
  },
): Promise<string> {
  const id = randomUUID();
  await testDb.ownerDb.execute(sql`
    insert into governance.objectives
      (id, organization_id, team_id, project_id, user_id, title, description, parent_objective_id, status, created_at)
    values
      (
        ${id},
        ${params.organizationId},
        ${params.teamId ?? null},
        ${params.projectId ?? null},
        ${params.userId ?? null},
        ${params.title},
        null,
        ${params.parentObjectiveId ?? null},
        ${params.status ?? "active"},
        ${(params.createdAt ?? new Date()).toISOString()}
      )
  `);
  return id;
}
