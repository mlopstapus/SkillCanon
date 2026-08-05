import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { withTenantContext } from "@/shared/db/tenant-context";
import type { TestDb } from "@/shared/db/test-helpers";
import type { PolicyActor, PolicyScopeVerifier } from "../domain/policy";
import { createPolicy } from "./create-policy";

export interface PolicyFixtureOrg {
  organizationId: string;
  actor: PolicyActor;
  teamId: string;
  userId: string;
}

/** fixture.actor is org 'admin' (031-governance-views-ui) so it satisfies assertCanManagePolicyForTeam's org-admin-or-team-owner rule by default — most tests only care about resolution/scoping behavior, not authorization itself. */
export async function makePolicyFixtureOrg(testDb: TestDb): Promise<PolicyFixtureOrg> {
  const organizationId = randomUUID();
  const teamId = randomUUID();
  const userId = randomUUID();
  const slug = `org-${randomUUID()}`;
  const teamSlug = `team-${randomUUID()}`;

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
    values (${userId}, ${organizationId}, ${teamId}, ${`user-${randomUUID()}`}, 'Test User', ${`${randomUUID()}@example.com`}, 'admin', true)
  `);

  return {
    organizationId,
    actor: { organizationId, userId },
    teamId,
    userId,
  };
}

export function makeScopeVerifier(scopes: Array<{ id: string; organizationId: string }>): PolicyScopeVerifier {
  const byId = new Map(scopes.map((scope) => [scope.id, scope.organizationId]));
  return {
    teamBelongsToOrganization: async (organizationId, teamId) => byId.get(teamId) === organizationId,
  };
}

export async function createTestPolicy(
  testDb: TestDb,
  fixture: PolicyFixtureOrg,
  overrides: Partial<Parameters<typeof createPolicy>[2]> = {},
) {
  const verifier = makeScopeVerifier([
    { id: fixture.teamId, organizationId: fixture.organizationId },
  ]);
  return withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
    createPolicy(
      tx,
      fixture.actor,
      {
        teamId: fixture.teamId,
        name: `Policy ${randomUUID()}`,
        enforcementType: "prepend",
        content: "Use tests.",
        priority: 0,
        ...overrides,
      },
      verifier,
    ),
  );
}

export async function countPolicies(testDb: TestDb): Promise<number> {
  const rows = await testDb.ownerDb.execute<{ count: number | string }>(
    sql`select count(*)::int as count from governance.policies`,
  );
  return Number(rows[0]?.count ?? 0);
}

export async function queryPolicyRows(
  testDb: TestDb,
  whereSql: ReturnType<typeof sql>,
): Promise<Array<Record<string, unknown>>> {
  const rows = await testDb.ownerDb.execute<Record<string, unknown>>(
    sql`select * from governance.policies where ${whereSql}`,
  );
  return Array.from(rows);
}

export async function queryPolicyAuditEvents(
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


export async function createPolicyFixtureTeam(
  testDb: TestDb,
  fixture: PolicyFixtureOrg,
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

export async function createPolicyFixtureUser(
  testDb: TestDb,
  fixture: PolicyFixtureOrg,
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

export async function insertPolicyRow(
  testDb: TestDb,
  params: {
    organizationId: string;
    teamId: string;
    name: string;
    priority?: number;
    isActive?: boolean;
  },
): Promise<string> {
  const id = randomUUID();
  await testDb.ownerDb.execute(sql`
    insert into governance.policies
      (id, organization_id, team_id, name, enforcement_type, content, priority, is_active)
    values
      (
        ${id},
        ${params.organizationId},
        ${params.teamId},
        ${params.name},
        'prepend',
        ${`${params.name} content`},
        ${params.priority ?? 0},
        ${params.isActive ?? true}
      )
  `);
  return id;
}
