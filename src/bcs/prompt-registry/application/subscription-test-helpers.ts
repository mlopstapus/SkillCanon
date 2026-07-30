import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { UserSummary } from "@/bcs/identity-access";
import { withTenantContext } from "@/shared/db/tenant-context";
import type { TestDb } from "@/shared/db/test-helpers";
import { insertPrompt } from "../infrastructure/prompts-repo";
import { createPrompt } from "./create-prompt";

export interface SubscriptionFixtureOrg {
  organizationId: string;
  otherOrgId: string;

  /** Org X — org admin; authorized to act on behalf of any team in org X. */
  orgAdmin: UserSummary;
  /** Org X — a "member"-role personal skill owner (the common "source" user). */
  userA: UserSummary;
  /** Org X — a second "member"-role personal user (common subscriber/forker). */
  userB: UserSummary;

  /** Org X — a team whose `owner_id` is `team1Owner` (the common "subscribing/forking team"). */
  team1Id: string;
  team1Owner: UserSummary;

  /** Org X — a second team whose `owner_id` is `team2Owner` (a "source-owning team"). */
  team2Id: string;
  team2Owner: UserSummary;

  /** Org Y — entirely separate organization, for cross-org negative tests. */
  otherOrgUser: UserSummary;
  otherOrgTeamId: string;
  otherOrgTeamOwner: UserSummary;
}

export async function makeSubscriptionFixtureOrg(testDb: TestDb): Promise<SubscriptionFixtureOrg> {
  const organizationId = randomUUID();
  const otherOrgId = randomUUID();
  const orgSlug = `org-${randomUUID()}`;
  const otherOrgSlug = `org-${randomUUID()}`;

  const team1Id = randomUUID();
  const team2Id = randomUUID();
  const otherOrgTeamId = randomUUID();

  const orgAdminId = randomUUID();
  const userAId = randomUUID();
  const userBId = randomUUID();
  const team1OwnerId = randomUUID();
  const team2OwnerId = randomUUID();
  const otherOrgUserId = randomUUID();
  const otherOrgTeamOwnerId = randomUUID();

  await testDb.ownerDb.execute(sql`
    insert into identity_access.organizations (id, name, slug)
    values
      (${organizationId}, ${`Org ${orgSlug}`}, ${orgSlug}),
      (${otherOrgId}, ${`Org ${otherOrgSlug}`}, ${otherOrgSlug})
  `);
  await testDb.ownerDb.execute(sql`
    insert into identity_access.teams (id, organization_id, name, slug)
    values
      (${team1Id}, ${organizationId}, 'Team One', ${`team-${randomUUID()}`}),
      (${team2Id}, ${organizationId}, 'Team Two', ${`team-${randomUUID()}`}),
      (${otherOrgTeamId}, ${otherOrgId}, 'Other Org Team', ${`team-${randomUUID()}`})
  `);

  const userRows: Array<{
    id: string;
    teamId: string;
    orgId: string;
    role: "admin" | "member";
    email: string;
  }> = [
    { id: orgAdminId, teamId: team1Id, orgId: organizationId, role: "admin", email: `${randomUUID()}@example.com` },
    { id: userAId, teamId: team1Id, orgId: organizationId, role: "member", email: `${randomUUID()}@example.com` },
    { id: userBId, teamId: team2Id, orgId: organizationId, role: "member", email: `${randomUUID()}@example.com` },
    {
      id: team1OwnerId,
      teamId: team1Id,
      orgId: organizationId,
      role: "member",
      email: `${randomUUID()}@example.com`,
    },
    {
      id: team2OwnerId,
      teamId: team2Id,
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
    {
      id: otherOrgTeamOwnerId,
      teamId: otherOrgTeamId,
      orgId: otherOrgId,
      role: "member",
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
    update identity_access.teams set owner_id = ${team1OwnerId} where id = ${team1Id}
  `);
  await testDb.ownerDb.execute(sql`
    update identity_access.teams set owner_id = ${team2OwnerId} where id = ${team2Id}
  `);
  await testDb.ownerDb.execute(sql`
    update identity_access.teams set owner_id = ${otherOrgTeamOwnerId} where id = ${otherOrgTeamId}
  `);

  const toSummary = (u: (typeof userRows)[number]): UserSummary => ({
    id: u.id,
    orgId: u.orgId,
    teamId: u.teamId,
    role: u.role,
    email: u.email,
  });

  return {
    organizationId,
    otherOrgId,
    orgAdmin: toSummary(userRows[0]!),
    userA: toSummary(userRows[1]!),
    userB: toSummary(userRows[2]!),
    team1Id,
    team1Owner: toSummary(userRows[3]!),
    team2Id,
    team2Owner: toSummary(userRows[4]!),
    otherOrgUser: toSummary(userRows[5]!),
    otherOrgTeamId,
    otherOrgTeamOwner: toSummary(userRows[6]!),
  };
}

export async function createTestSkillOwnedByUser(
  testDb: TestDb,
  organizationId: string,
  ownerUserId: string,
  nameOverride?: string,
) {
  const name = nameOverride ?? `user-skill-${randomUUID()}`;
  return withTenantContext(testDb.appDb, organizationId, (tx) =>
    createPrompt(tx, { organizationId, userId: ownerUserId }, { organizationId, name }),
  );
}

export async function createTestSkillOwnedByTeam(
  testDb: TestDb,
  organizationId: string,
  teamId: string,
  nameOverride?: string,
) {
  const name = nameOverride ?? `team-skill-${randomUUID()}`;
  return withTenantContext(testDb.appDb, organizationId, (tx) =>
    insertPrompt(tx, {
      id: randomUUID(),
      organizationId,
      name,
      description: null,
      isDeprecated: false,
      activeVersionId: null,
      ownerType: "team",
      ownerId: teamId,
      forkedFromSkillId: null,
    }),
  );
}

export async function queryPromptRows(
  testDb: TestDb,
  whereSql: ReturnType<typeof sql>,
): Promise<Array<Record<string, unknown>>> {
  const rows = await testDb.ownerDb.execute<Record<string, unknown>>(
    sql`select * from prompt_registry.prompts where ${whereSql}`,
  );
  return Array.from(rows);
}

export async function querySubscriptionRows(
  testDb: TestDb,
  whereSql: ReturnType<typeof sql>,
): Promise<Array<Record<string, unknown>>> {
  const rows = await testDb.ownerDb.execute<Record<string, unknown>>(
    sql`select * from prompt_registry.subscriptions where ${whereSql}`,
  );
  return Array.from(rows);
}

export async function querySubscriptionAuditEvents(
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
