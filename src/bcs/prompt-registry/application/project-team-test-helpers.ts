import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { UserSummary } from "@/bcs/identity-access";
import { withTenantContext } from "@/shared/db/tenant-context";
import type { TestDb } from "@/shared/db/test-helpers";
import { createProject } from "./create-project";
import { makeIdentityVerifier } from "./project-test-helpers";

export interface ProjectTeamFixtureOrg {
  organizationId: string;
  otherOrgId: string;

  /** The project's owner team. */
  ownerTeamId: string;
  /** Org admin — authorized to act on behalf of any team in this org (including `ownerTeamId`). */
  ownerTeamAdmin: UserSummary;
  /** A "member"-role user of `ownerTeamId`, neither org admin nor that team's `owner_id` — the unauthorized-caller fixture. */
  nonAdminMember: UserSummary;

  /** A second, same-org team never added as a collaborator — a valid "not yet participating" target. */
  collaboratorTeamId: string;
  collaboratorTeamOwner: UserSummary;

  /** A third, same-org team — used as the "never participates" negative-eligibility fixture. */
  nonParticipatingTeamId: string;

  /** Entirely separate organization, for cross-org negative tests. */
  otherOrgTeamId: string;
  otherOrgUser: UserSummary;

  /** A real project, already created, owned by `ownerTeamId`. */
  projectId: string;
}

export async function makeProjectTeamFixtureOrg(testDb: TestDb): Promise<ProjectTeamFixtureOrg> {
  const organizationId = randomUUID();
  const otherOrgId = randomUUID();
  const orgSlug = `org-${randomUUID()}`;
  const otherOrgSlug = `org-${randomUUID()}`;

  const ownerTeamId = randomUUID();
  const collaboratorTeamId = randomUUID();
  const nonParticipatingTeamId = randomUUID();
  const otherOrgTeamId = randomUUID();

  const ownerTeamAdminId = randomUUID();
  const nonAdminMemberId = randomUUID();
  const collaboratorTeamOwnerId = randomUUID();
  const otherOrgUserId = randomUUID();

  await testDb.ownerDb.execute(sql`
    insert into identity_access.organizations (id, name, slug)
    values
      (${organizationId}, ${`Org ${orgSlug}`}, ${orgSlug}),
      (${otherOrgId}, ${`Org ${otherOrgSlug}`}, ${otherOrgSlug})
  `);
  await testDb.ownerDb.execute(sql`
    insert into identity_access.teams (id, organization_id, name, slug)
    values
      (${ownerTeamId}, ${organizationId}, 'Owner Team', ${`team-${randomUUID()}`}),
      (${collaboratorTeamId}, ${organizationId}, 'Collaborator Team', ${`team-${randomUUID()}`}),
      (${nonParticipatingTeamId}, ${organizationId}, 'Non-Participating Team', ${`team-${randomUUID()}`}),
      (${otherOrgTeamId}, ${otherOrgId}, 'Other Org Team', ${`team-${randomUUID()}`})
  `);

  const userRows: Array<{
    id: string;
    teamId: string;
    orgId: string;
    role: "admin" | "member";
    email: string;
  }> = [
    {
      id: ownerTeamAdminId,
      teamId: ownerTeamId,
      orgId: organizationId,
      role: "admin",
      email: `${randomUUID()}@example.com`,
    },
    {
      id: nonAdminMemberId,
      teamId: ownerTeamId,
      orgId: organizationId,
      role: "member",
      email: `${randomUUID()}@example.com`,
    },
    {
      id: collaboratorTeamOwnerId,
      teamId: collaboratorTeamId,
      orgId: organizationId,
      role: "member",
      email: `${randomUUID()}@example.com`,
    },
    {
      id: otherOrgUserId,
      teamId: otherOrgTeamId,
      orgId: otherOrgId,
      role: "admin",
      email: `${randomUUID()}@example.com`,
    },
  ];

  for (const u of userRows) {
    await testDb.ownerDb.execute(sql`
      insert into identity_access.users (id, organization_id, team_id, username, display_name, email, role, is_active)
      values (${u.id}, ${u.orgId}, ${u.teamId}, ${`user-${randomUUID()}`}, 'Test User', ${u.email}, ${u.role}, true)
    `);
  }

  await testDb.ownerDb.execute(sql`
    update identity_access.teams set owner_id = ${collaboratorTeamOwnerId} where id = ${collaboratorTeamId}
  `);

  const toSummary = (u: (typeof userRows)[number]): UserSummary => ({
    id: u.id,
    orgId: u.orgId,
    teamId: u.teamId,
    role: u.role,
    email: u.email,
  });

  const ownerTeamAdmin = toSummary(userRows[0]!);

  const verifier = makeIdentityVerifier({
    organizationIds: [organizationId],
    teams: [{ id: ownerTeamId, organizationId }],
    users: [{ id: ownerTeamAdminId, organizationId }],
  });

  const project = await withTenantContext(testDb.appDb, organizationId, (tx) =>
    createProject(
      tx,
      { organizationId, userId: ownerTeamAdminId },
      {
        organizationId,
        teamId: ownerTeamId,
        name: `Project ${randomUUID()}`,
        slug: `project-${randomUUID()}`,
      },
      verifier,
    ),
  );

  return {
    organizationId,
    otherOrgId,
    ownerTeamId,
    ownerTeamAdmin,
    nonAdminMember: toSummary(userRows[1]!),
    collaboratorTeamId,
    collaboratorTeamOwner: toSummary(userRows[2]!),
    nonParticipatingTeamId,
    otherOrgTeamId,
    otherOrgUser: toSummary(userRows[3]!),
    projectId: project.id,
  };
}

export async function queryProjectTeamRows(
  testDb: TestDb,
  whereSql: ReturnType<typeof sql>,
): Promise<Array<Record<string, unknown>>> {
  const rows = await testDb.ownerDb.execute<Record<string, unknown>>(
    sql`select * from prompt_registry.project_teams where ${whereSql}`,
  );
  return Array.from(rows);
}

export async function queryProjectSkillAssignmentRows(
  testDb: TestDb,
  whereSql: ReturnType<typeof sql>,
): Promise<Array<Record<string, unknown>>> {
  const rows = await testDb.ownerDb.execute<Record<string, unknown>>(
    sql`select * from prompt_registry.project_skill_assignments where ${whereSql}`,
  );
  return Array.from(rows);
}

export async function queryAuditEvents(
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
