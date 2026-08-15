import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserSummary } from "@/bcs/identity-access";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import {
  CannotTransferToSameOwnerError,
  CrossOrgTransferError,
  SkillNotFoundForTransferError,
  SubscriberNotAuthorizedError,
} from "../domain/subscription";
import { getPromptById } from "./get-prompt-by-id";
import { publishVersion } from "./publish-version";
import { transferSkillOwnership } from "./transfer-skill-ownership";
import {
  createTestSkillOwnedByTeam,
  createTestSkillOwnedByUser,
  makeSubscriptionFixtureOrg,
  querySubscriptionAuditEvents,
} from "./subscription-test-helpers";

async function addTeamOwnedBy(testDb: TestDb, organizationId: string, ownerId: string): Promise<string> {
  const id = randomUUID();
  await testDb.ownerDb.execute(sql`
    insert into identity_access.teams (id, organization_id, name, slug, owner_id)
    values (${id}, ${organizationId}, ${`Extra team ${id}`}, ${`team-${id}`}, ${ownerId})
  `);
  return id;
}

async function addUnassignedOrgAdmin(testDb: TestDb, organizationId: string): Promise<UserSummary> {
  const id = randomUUID();
  const email = `${id}@example.com`;
  await testDb.ownerDb.execute(sql`
    insert into identity_access.users (id, organization_id, team_id, username, display_name, email, role, is_active)
    values (${id}, ${organizationId}, null, ${`admin-${id}`}, 'Unassigned Admin', ${email}, 'admin', true)
  `);
  return { id, orgId: organizationId, teamId: null, role: "admin", email };
}

describe("transferSkillOwnership", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("moves a user-owned skill to its owner's team and records ownership-only audit snapshots", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByUser(
      testDb,
      fixture.organizationId,
      fixture.team1Owner.id,
    );

    const transferred = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      transferSkillOwnership(
        tx,
        fixture.team1Owner,
        source.id,
        { newOwnerType: "team", newOwnerId: fixture.team1Id },
        { transport: "api", sourceIp: "10.0.0.2" },
      ),
    );

    expect(transferred).toMatchObject({
      id: source.id,
      ownerType: "team",
      ownerId: fixture.team1Id,
      activeVersionId: source.activeVersionId,
      forkedFromSkillId: source.forkedFromSkillId,
    });

    const events = await testDb.ownerDb.execute<{
      organization_id: string;
      actor_user_id: string | null;
      actor_api_key_id: string | null;
      action: string;
      resource_type: string;
      resource_id: string | null;
      before: unknown;
      after: unknown;
      transport: string;
      source_ip: string | null;
    }>(sql`
      select organization_id, actor_user_id, actor_api_key_id, action, resource_type,
        resource_id, before, after, transport, source_ip
      from audit.audit_events
      where action = 'skill.owner_transferred' and resource_id = ${source.id}
    `);
    expect(Array.from(events)).toEqual([
      {
        organization_id: fixture.organizationId,
        actor_user_id: fixture.team1Owner.id,
        actor_api_key_id: null,
        action: "skill.owner_transferred",
        resource_type: "prompt",
        resource_id: source.id,
        before: { ownerType: "user", ownerId: fixture.team1Owner.id },
        after: { ownerType: "team", ownerId: fixture.team1Id },
        transport: "api",
        source_ip: "10.0.0.2",
      },
    ]);
  });

  it("allows a team owner to transfer their team's skill to another team they own", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const destinationTeamId = await addTeamOwnedBy(testDb, fixture.organizationId, fixture.team1Owner.id);
    const source = await createTestSkillOwnedByTeam(testDb, fixture.organizationId, fixture.team1Id);

    const transferred = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      transferSkillOwnership(tx, fixture.team1Owner, source.id, {
        newOwnerType: "team",
        newOwnerId: destinationTeamId,
      }),
    );

    expect(transferred).toMatchObject({ ownerType: "team", ownerId: destinationTeamId });
  });

  it("allows a team owner to transfer their team's skill to themselves", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByTeam(testDb, fixture.organizationId, fixture.team1Id);

    const transferred = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      transferSkillOwnership(tx, fixture.team1Owner, source.id, {
        newOwnerType: "user",
        newOwnerId: fixture.team1Owner.id,
      }),
    );

    expect(transferred).toMatchObject({ ownerType: "user", ownerId: fixture.team1Owner.id });
  });

  it("allows an unassigned organization admin to transfer between unrelated teams", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const admin = await addUnassignedOrgAdmin(testDb, fixture.organizationId);
    const source = await createTestSkillOwnedByTeam(testDb, fixture.organizationId, fixture.team1Id);

    const transferred = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      transferSkillOwnership(tx, admin, source.id, {
        newOwnerType: "team",
        newOwnerId: fixture.team2Id,
      }),
    );

    expect(transferred).toMatchObject({ ownerType: "team", ownerId: fixture.team2Id });
  });

  it("allows a non-admin only when they are authorized for both owners", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByUser(testDb, fixture.organizationId, fixture.team1Owner.id);

    const transferred = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      transferSkillOwnership(tx, fixture.team1Owner, source.id, {
        newOwnerType: "team",
        newOwnerId: fixture.team1Id,
      }),
    );

    expect(transferred).toMatchObject({ ownerType: "team", ownerId: fixture.team1Id });
  });

  it("rejects a non-admin who is unauthorized for the source owner", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByTeam(testDb, fixture.organizationId, fixture.team1Id);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        transferSkillOwnership(tx, fixture.userB, source.id, {
          newOwnerType: "user",
          newOwnerId: fixture.userB.id,
        }),
      ),
    ).rejects.toBeInstanceOf(SubscriberNotAuthorizedError);
  });

  it("rejects a non-admin who is authorized for the source but not the destination", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByTeam(testDb, fixture.organizationId, fixture.team1Id);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        transferSkillOwnership(tx, fixture.team1Owner, source.id, {
          newOwnerType: "team",
          newOwnerId: fixture.team2Id,
        }),
      ),
    ).rejects.toBeInstanceOf(SubscriberNotAuthorizedError);
  });

  it.each(["team", "user"] as const)("maps a cross-organization %s destination to CrossOrgTransferError", async (newOwnerType) => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByTeam(testDb, fixture.organizationId, fixture.team1Id);
    const newOwnerId = newOwnerType === "team" ? fixture.otherOrgTeamId : fixture.otherOrgUser.id;

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        transferSkillOwnership(tx, fixture.orgAdmin, source.id, { newOwnerType, newOwnerId }),
      ),
    ).rejects.toBeInstanceOf(CrossOrgTransferError);
  });

  it.each(["team", "user"] as const)("maps a nonexistent %s destination to CrossOrgTransferError", async (newOwnerType) => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByTeam(testDb, fixture.organizationId, fixture.team1Id);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        transferSkillOwnership(tx, fixture.orgAdmin, source.id, {
          newOwnerType,
          newOwnerId: randomUUID(),
        }),
      ),
    ).rejects.toBeInstanceOf(CrossOrgTransferError);
  });

  it("rejects the exact same owner before authorization and writes no audit row", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByTeam(testDb, fixture.organizationId, fixture.team1Id);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        transferSkillOwnership(tx, fixture.userB, source.id, {
          newOwnerType: "team",
          newOwnerId: fixture.team1Id,
        }),
      ),
    ).rejects.toBeInstanceOf(CannotTransferToSameOwnerError);

    expect(
      await querySubscriptionAuditEvents(
        testDb,
        sql`action = 'skill.owner_transferred' and resource_id = ${source.id}`,
      ),
    ).toHaveLength(0);
  });

  it("maps a nonexistent skill to SkillNotFoundForTransferError", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        transferSkillOwnership(tx, fixture.orgAdmin, randomUUID(), {
          newOwnerType: "team",
          newOwnerId: fixture.team1Id,
        }),
      ),
    ).rejects.toBeInstanceOf(SkillNotFoundForTransferError);
  });

  it("changes only ownership while preserving id, active version, and fork lineage", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const lineageSource = await createTestSkillOwnedByUser(testDb, fixture.organizationId, fixture.userA.id);
    const source = await createTestSkillOwnedByUser(testDb, fixture.organizationId, fixture.team1Owner.id, "transfer-invariants");
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      publishVersion(tx, { organizationId: fixture.organizationId, userId: fixture.team1Owner.id }, {
        organizationId: fixture.organizationId,
        promptName: "transfer-invariants",
        version: "v1",
        mainFile: { content: "Be helpful." },
      }),
    );
    await testDb.ownerDb.execute(sql`
      update prompt_registry.prompts
      set forked_from_skill_id = ${lineageSource.id}
      where id = ${source.id}
    `);
    const before = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      getPromptById(tx, fixture.organizationId, source.id),
    );

    const transferred = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      transferSkillOwnership(tx, fixture.team1Owner, source.id, {
        newOwnerType: "team",
        newOwnerId: fixture.team1Id,
      }),
    );

    expect(transferred).toMatchObject({
      id: before?.id,
      activeVersionId: before?.activeVersionId,
      forkedFromSkillId: before?.forkedFromSkillId,
      ownerType: "team",
      ownerId: fixture.team1Id,
    });
  });

  it("allows concurrent transfers with last-write-wins ownership", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const secondTeamId = await addTeamOwnedBy(testDb, fixture.organizationId, fixture.team1Owner.id);
    const source = await createTestSkillOwnedByTeam(testDb, fixture.organizationId, fixture.team1Id);

    const results = await Promise.all([
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        transferSkillOwnership(tx, fixture.team1Owner, source.id, {
          newOwnerType: "user",
          newOwnerId: fixture.team1Owner.id,
        }),
      ),
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        transferSkillOwnership(tx, fixture.team1Owner, source.id, {
          newOwnerType: "team",
          newOwnerId: secondTeamId,
        }),
      ),
    ]);
    const current = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      getPromptById(tx, fixture.organizationId, source.id),
    );

    expect(results).toHaveLength(2);
    expect([
      { ownerType: "user", ownerId: fixture.team1Owner.id },
      { ownerType: "team", ownerId: secondTeamId },
    ]).toContainEqual({ ownerType: current?.ownerType, ownerId: current?.ownerId });
  });
});
