import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { UserSummary } from "@/bcs/identity-access";
import { createProject, type ProjectIdentityVerifier } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db/tenant-context";
import type { TestDb } from "@/shared/db/test-helpers";

export interface WorkflowFixtureOrg {
  organizationId: string;
  teamId: string;
  /** Org admin. */
  adminActor: UserSummary;
  /** Non-admin, same org as `adminActor`. */
  memberActor: UserSummary;
  /** A second non-admin in the same org, distinct from `memberActor`. */
  otherMemberActor: UserSummary;
  otherOrgId: string;
  otherOrgTeamId: string;
  /** Org admin in `otherOrgId` — a wholly different organization. */
  otherOrgAdminActor: UserSummary;
}

export async function makeWorkflowFixtureOrg(testDb: TestDb): Promise<WorkflowFixtureOrg> {
  const organizationId = randomUUID();
  const otherOrgId = randomUUID();
  const teamId = randomUUID();
  const otherOrgTeamId = randomUUID();
  const adminUserId = randomUUID();
  const memberUserId = randomUUID();
  const otherMemberUserId = randomUUID();
  const otherOrgAdminUserId = randomUUID();
  const orgSlug = `org-${randomUUID()}`;
  const otherOrgSlug = `org-${randomUUID()}`;

  await testDb.ownerDb.execute(sql`
    insert into identity_access.organizations (id, name, slug)
    values
      (${organizationId}, ${`Org ${orgSlug}`}, ${orgSlug}),
      (${otherOrgId}, ${`Org ${otherOrgSlug}`}, ${otherOrgSlug})
  `);
  await testDb.ownerDb.execute(sql`
    insert into identity_access.teams (id, organization_id, name, slug)
    values
      (${teamId}, ${organizationId}, 'Root', ${`team-${randomUUID()}`}),
      (${otherOrgTeamId}, ${otherOrgId}, 'Root', ${`team-${randomUUID()}`})
  `);
  await testDb.ownerDb.execute(sql`
    insert into identity_access.users (id, organization_id, team_id, username, display_name, email, role, is_active)
    values
      (${adminUserId}, ${organizationId}, ${teamId}, ${`user-${randomUUID()}`}, 'Admin', ${`${randomUUID()}@example.com`}, 'admin', true),
      (${memberUserId}, ${organizationId}, ${teamId}, ${`user-${randomUUID()}`}, 'Member', ${`${randomUUID()}@example.com`}, 'member', true),
      (${otherMemberUserId}, ${organizationId}, ${teamId}, ${`user-${randomUUID()}`}, 'Other Member', ${`${randomUUID()}@example.com`}, 'member', true),
      (${otherOrgAdminUserId}, ${otherOrgId}, ${otherOrgTeamId}, ${`user-${randomUUID()}`}, 'Other Org Admin', ${`${randomUUID()}@example.com`}, 'admin', true)
  `);

  return {
    organizationId,
    teamId,
    adminActor: { id: adminUserId, orgId: organizationId, teamId, role: "admin", email: "admin@example.com" },
    memberActor: { id: memberUserId, orgId: organizationId, teamId, role: "member", email: "member@example.com" },
    otherMemberActor: {
      id: otherMemberUserId,
      orgId: organizationId,
      teamId,
      role: "member",
      email: "other-member@example.com",
    },
    otherOrgId,
    otherOrgTeamId,
    otherOrgAdminActor: {
      id: otherOrgAdminUserId,
      orgId: otherOrgId,
      teamId: otherOrgTeamId,
      role: "admin",
      email: "other-org-admin@example.com",
    },
  };
}

function trivialProjectVerifier(organizationId: string, teamId: string): ProjectIdentityVerifier {
  return {
    organizationExists: async (orgId) => orgId === organizationId,
    teamBelongsToOrganization: async (orgId, tid) => orgId === organizationId && tid === teamId,
    userBelongsToOrganization: async (orgId) => orgId === organizationId,
  };
}

/** Creates a real `prompt_registry.projects` row owned by `fixture`'s org/team. */
export async function createTestProjectInOrg(testDb: TestDb, fixture: WorkflowFixtureOrg) {
  return withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
    createProject(
      tx,
      { organizationId: fixture.organizationId, userId: fixture.adminActor.id },
      {
        organizationId: fixture.organizationId,
        teamId: fixture.teamId,
        name: `Project ${randomUUID()}`,
        slug: `project-${randomUUID()}`,
      },
      trivialProjectVerifier(fixture.organizationId, fixture.teamId),
    ),
  );
}

export async function queryWorkflowRows(
  testDb: TestDb,
  whereSql: ReturnType<typeof sql>,
): Promise<Array<Record<string, unknown>>> {
  const rows = await testDb.ownerDb.execute<Record<string, unknown>>(
    sql`select * from workflow.workflows where ${whereSql}`,
  );
  return Array.from(rows);
}

export async function queryWorkflowAuditEvents(
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
