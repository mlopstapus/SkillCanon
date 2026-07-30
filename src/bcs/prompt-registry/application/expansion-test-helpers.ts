import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { createObjective, createPolicy, type PolicyEnforcementType } from "@/bcs/governance";
import { withTenantContext } from "@/shared/db/tenant-context";
import type { TestDb } from "@/shared/db/test-helpers";
import { createPrompt } from "./create-prompt";
import { deprecatePrompt } from "./deprecate-prompt";
import { makePromptFixtureOrg, type PromptFixtureOrg } from "./prompt-test-helpers";
import { publishVersion } from "./publish-version";

export type ExpansionFixtureOrg = PromptFixtureOrg;

export async function makeExpansionFixtureOrg(testDb: TestDb): Promise<ExpansionFixtureOrg> {
  return makePromptFixtureOrg(testDb);
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

export interface PublishSkillParams {
  name: string;
  systemTemplate?: string | null;
  userTemplate?: string | null;
  version?: string;
}

/** Creates a skill and publishes one version — the common case for expansion tests. */
export async function publishSkill(testDb: TestDb, fixture: ExpansionFixtureOrg, params: PublishSkillParams) {
  return withTenantContext(testDb.appDb, fixture.organizationId, async (tx) => {
    await createPrompt(tx, fixture.actor, { organizationId: fixture.organizationId, name: params.name });
    return publishVersion(tx, fixture.actor, {
      promptName: params.name,
      organizationId: fixture.organizationId,
      version: params.version ?? "1.0.0",
      systemTemplate: params.systemTemplate ?? null,
      userTemplate: params.userTemplate ?? null,
    });
  });
}

/** Creates a skill, publishes a version, then deprecates it (FR-002/SC-006). */
export async function publishDeprecatedSkill(testDb: TestDb, fixture: ExpansionFixtureOrg, params: PublishSkillParams) {
  const version = await publishSkill(testDb, fixture, params);
  await withTenantContext(testDb.appDb, fixture.organizationId, (tx) => deprecatePrompt(tx, fixture.actor, params.name));
  return version;
}

/** Creates a skill with zero published versions — "no published version yet" (FR-002). */
export async function createUnpublishedSkill(testDb: TestDb, fixture: ExpansionFixtureOrg, name: string) {
  return withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
    createPrompt(tx, fixture.actor, { organizationId: fixture.organizationId, name }),
  );
}

/** Publishes a second version on top of an already-published skill (for explicit-version-pin tests). */
export async function publishAnotherVersion(
  testDb: TestDb,
  fixture: ExpansionFixtureOrg,
  params: PublishSkillParams,
) {
  return withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
    publishVersion(tx, fixture.actor, {
      promptName: params.name,
      organizationId: fixture.organizationId,
      version: params.version ?? "2.0.0",
      systemTemplate: params.systemTemplate ?? null,
      userTemplate: params.userTemplate ?? null,
    }),
  );
}

// ---------------------------------------------------------------------------
// Teams & users (raw SQL — governance's own test-helpers live in a different
// bounded context and can't be imported directly per eslint-plugin-boundaries;
// only its public barrel (createPolicy/createObjective, used below) is fair
// game).
// ---------------------------------------------------------------------------

export async function createExpansionFixtureTeam(
  testDb: TestDb,
  fixture: ExpansionFixtureOrg,
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

export async function createExpansionFixtureUser(
  testDb: TestDb,
  fixture: ExpansionFixtureOrg,
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

// ---------------------------------------------------------------------------
// Policies & objectives — always granted on the fixture org's root team
// unless a different `teamId` is supplied, via Governance's own exposed
// create operations (never its schema/test-helpers directly).
// ---------------------------------------------------------------------------

const ALWAYS_TRUE_SCOPE_VERIFIER = {
  teamBelongsToOrganization: async () => true,
  projectBelongsToOrganization: async () => true,
  userBelongsToOrganization: async () => true,
};

export async function grantPolicy(
  testDb: TestDb,
  fixture: ExpansionFixtureOrg,
  teamId: string,
  params: { name: string; enforcementType: PolicyEnforcementType; content: string; priority?: number },
) {
  return withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
    createPolicy(
      tx,
      fixture.actor,
      {
        teamId,
        name: params.name,
        enforcementType: params.enforcementType,
        content: params.content,
        priority: params.priority ?? 0,
      },
      ALWAYS_TRUE_SCOPE_VERIFIER,
    ),
  );
}

export async function grantObjective(
  testDb: TestDb,
  fixture: ExpansionFixtureOrg,
  scope: { teamId?: string | null; projectId?: string | null; userId?: string | null },
  title: string,
) {
  return withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
    createObjective(tx, fixture.actor, { ...scope, title }, ALWAYS_TRUE_SCOPE_VERIFIER),
  );
}
