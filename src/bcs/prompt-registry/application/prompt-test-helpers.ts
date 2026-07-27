import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { withTenantContext } from "@/shared/db/tenant-context";
import type { TestDb } from "@/shared/db/test-helpers";
import type { PromptActor, PromptIdentityVerifier } from "../domain/prompt";
import { createPrompt } from "./create-prompt";

export interface PromptFixtureOrg {
  organizationId: string;
  actor: PromptActor;
  actorUserId: string;
  otherUserId: string;
  otherOrgId: string;
  otherOrgActorUserId: string;
}

export async function makePromptFixtureOrg(testDb: TestDb): Promise<PromptFixtureOrg> {
  const organizationId = randomUUID();
  const otherOrgId = randomUUID();
  const actorUserId = randomUUID();
  const otherUserId = randomUUID();
  const otherOrgActorUserId = randomUUID();
  const orgSlug = `org-${randomUUID()}`;
  const otherOrgSlug = `org-${randomUUID()}`;
  const teamId = randomUUID();
  const otherOrgTeamId = randomUUID();

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
      (${actorUserId}, ${organizationId}, ${teamId}, ${`user-${randomUUID()}`}, 'Actor', ${`${randomUUID()}@example.com`}, 'admin', true),
      (${otherUserId}, ${organizationId}, ${teamId}, ${`user-${randomUUID()}`}, 'Other', ${`${randomUUID()}@example.com`}, 'member', true),
      (${otherOrgActorUserId}, ${otherOrgId}, ${otherOrgTeamId}, ${`user-${randomUUID()}`}, 'Other Org Actor', ${`${randomUUID()}@example.com`}, 'admin', true)
  `);

  return {
    organizationId,
    actor: { organizationId, userId: actorUserId },
    actorUserId,
    otherUserId,
    otherOrgId,
    otherOrgActorUserId,
  };
}

export function verifierFor(...fixtures: PromptFixtureOrg[]): PromptIdentityVerifier {
  const users = new Map<string, string>();
  for (const f of fixtures) {
    users.set(f.actorUserId, f.organizationId);
    users.set(f.otherUserId, f.organizationId);
    users.set(f.otherOrgActorUserId, f.otherOrgId);
  }
  return {
    userBelongsToOrganization: async (organizationId, userId) =>
      users.get(userId) === organizationId,
  };
}

export async function createPromptInOrg(
  testDb: TestDb,
  fixture: PromptFixtureOrg,
  nameOverride?: string,
) {
  const name = nameOverride ?? `prompt-${randomUUID()}`;
  return withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
    createPrompt(
      tx,
      fixture.actor,
      { organizationId: fixture.organizationId, name },
      verifierFor(fixture),
    ),
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

export async function queryPromptVersionRows(
  testDb: TestDb,
  whereSql: ReturnType<typeof sql>,
): Promise<Array<Record<string, unknown>>> {
  const rows = await testDb.ownerDb.execute<Record<string, unknown>>(
    sql`select * from prompt_registry.prompt_versions where ${whereSql}`,
  );
  return Array.from(rows);
}

export async function queryPromptAuditEvents(
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
