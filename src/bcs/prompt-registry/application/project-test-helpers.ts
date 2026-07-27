import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { withTenantContext } from "@/shared/db/tenant-context";
import type { TestDb } from "@/shared/db/test-helpers";
import type { ProjectActor, ProjectIdentityVerifier } from "../domain/project";
import { createProject } from "./create-project";

export interface ProjectFixtureOrg {
  organizationId: string;
  actor: ProjectActor;
  teamId: string;
  otherTeamId: string;
  actorUserId: string;
  otherUserId: string;
}

export async function makeProjectFixtureOrg(testDb: TestDb): Promise<ProjectFixtureOrg> {
  const organizationId = randomUUID();
  const teamId = randomUUID();
  const otherTeamId = randomUUID();
  const actorUserId = randomUUID();
  const otherUserId = randomUUID();
  const orgSlug = `org-${randomUUID()}`;

  await testDb.ownerDb.execute(sql`
    insert into identity_access.organizations (id, name, slug)
    values (${organizationId}, ${`Org ${orgSlug}`}, ${orgSlug})
  `);
  await testDb.ownerDb.execute(sql`
    insert into identity_access.teams (id, organization_id, name, slug)
    values (${teamId}, ${organizationId}, 'Root', ${`team-${randomUUID()}`})
  `);
  await testDb.ownerDb.execute(sql`
    insert into identity_access.teams (id, organization_id, name, slug, parent_team_id)
    values (${otherTeamId}, ${organizationId}, 'Other', ${`team-${randomUUID()}`}, ${teamId})
  `);
  await testDb.ownerDb.execute(sql`
    insert into identity_access.users (id, organization_id, team_id, username, display_name, email, role, is_active)
    values
      (${actorUserId}, ${organizationId}, ${teamId}, ${`user-${randomUUID()}`}, 'Actor User', ${`${randomUUID()}@example.com`}, 'admin', true),
      (${otherUserId}, ${organizationId}, ${otherTeamId}, ${`user-${randomUUID()}`}, 'Other User', ${`${randomUUID()}@example.com`}, 'member', true)
  `);

  return {
    organizationId,
    actor: { organizationId, userId: actorUserId },
    teamId,
    otherTeamId,
    actorUserId,
    otherUserId,
  };
}

export function makeIdentityVerifier(
  scopes: {
    organizationIds: string[];
    teams: Array<{ id: string; organizationId: string }>;
    users: Array<{ id: string; organizationId: string }>;
  },
): ProjectIdentityVerifier {
  const organizationIds = new Set(scopes.organizationIds);
  const teams = new Map(scopes.teams.map((team) => [team.id, team.organizationId]));
  const users = new Map(scopes.users.map((user) => [user.id, user.organizationId]));
  return {
    organizationExists: async (organizationId) => organizationIds.has(organizationId),
    teamBelongsToOrganization: async (organizationId, teamId) => teams.get(teamId) === organizationId,
    userBelongsToOrganization: async (organizationId, userId) => users.get(userId) === organizationId,
  };
}

export function verifierFor(...fixtures: ProjectFixtureOrg[]): ProjectIdentityVerifier {
  return makeIdentityVerifier({
    organizationIds: fixtures.map((fixture) => fixture.organizationId),
    teams: fixtures.flatMap((fixture) => [
      { id: fixture.teamId, organizationId: fixture.organizationId },
      { id: fixture.otherTeamId, organizationId: fixture.organizationId },
    ]),
    users: fixtures.flatMap((fixture) => [
      { id: fixture.actorUserId, organizationId: fixture.organizationId },
      { id: fixture.otherUserId, organizationId: fixture.organizationId },
    ]),
  });
}

export async function createTestProject(
  testDb: TestDb,
  fixture: ProjectFixtureOrg,
  overrides: Partial<Parameters<typeof createProject>[2]> = {},
) {
  return withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
    createProject(
      tx,
      fixture.actor,
      {
        organizationId: fixture.organizationId,
        teamId: fixture.teamId,
        name: `Project ${randomUUID()}`,
        slug: `project-${randomUUID()}`,
        ...overrides,
      },
      verifierFor(fixture),
    ),
  );
}

export async function countProjectRows(testDb: TestDb): Promise<number> {
  const rows = await testDb.ownerDb.execute<{ count: number | string }>(
    sql`select count(*)::int as count from prompt_registry.projects`,
  );
  return Number(rows[0]?.count ?? 0);
}

export async function countProjectMemberRows(testDb: TestDb): Promise<number> {
  const rows = await testDb.ownerDb.execute<{ count: number | string }>(
    sql`select count(*)::int as count from prompt_registry.project_members`,
  );
  return Number(rows[0]?.count ?? 0);
}

export async function queryProjectRows(
  testDb: TestDb,
  whereSql: ReturnType<typeof sql>,
): Promise<Array<Record<string, unknown>>> {
  const rows = await testDb.ownerDb.execute<Record<string, unknown>>(
    sql`select * from prompt_registry.projects where ${whereSql}`,
  );
  return Array.from(rows);
}

export async function queryProjectMemberRows(
  testDb: TestDb,
  whereSql: ReturnType<typeof sql>,
): Promise<Array<Record<string, unknown>>> {
  const rows = await testDb.ownerDb.execute<Record<string, unknown>>(
    sql`select * from prompt_registry.project_members where ${whereSql}`,
  );
  return Array.from(rows);
}

export async function queryProjectAuditEvents(
  testDb: TestDb,
  whereSql: ReturnType<typeof sql>,
): Promise<Array<{ action: string; resource_id: string | null; transport: string; source_ip: string | null }>> {
  const rows = await testDb.ownerDb.execute<{
    action: string;
    resource_id: string | null;
    transport: string;
    source_ip: string | null;
  }>(sql`select action, resource_id, transport, source_ip from audit.audit_events where ${whereSql}`);
  return Array.from(rows);
}
