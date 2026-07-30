import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import {
  CannotForkOwnSkillError,
  CrossOrgSubscriberError,
  SourceSkillNotFoundError,
  SubscriberNotAuthorizedError,
} from "../domain/subscription";
import { forkSkill } from "./fork-skill";
import { getPromptById } from "./get-prompt-by-id";
import { publishVersion } from "./publish-version";
import {
  createTestSkillOwnedByUser,
  makeSubscriptionFixtureOrg,
  queryPromptRows,
  querySubscriptionAuditEvents,
} from "./subscription-test-helpers";

describe("forkSkill", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("forks another user's skill into a new, independent skill with a lineage pointer and audit event", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByUser(
      testDb,
      fixture.organizationId,
      fixture.userA.id,
      "fork-source",
    );
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      publishVersion(tx, { organizationId: fixture.organizationId, userId: fixture.userA.id }, {
        organizationId: fixture.organizationId,
        promptName: "fork-source",
        version: "v1",
        systemTemplate: "Be helpful.",
        tags: ["a"],
      }),
    );

    const fork = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      forkSkill(
        tx,
        fixture.userB,
        source.id,
        { ownerType: "user", ownerId: fixture.userB.id },
        { transport: "api", sourceIp: "10.0.0.2" },
      ),
    );

    expect(fork.id).not.toBe(source.id);
    expect(fork.ownerType).toBe("user");
    expect(fork.ownerId).toBe(fixture.userB.id);
    expect(fork.forkedFromSkillId).toBe(source.id);
    expect(fork.activeVersionId).not.toBeNull();

    const events = await querySubscriptionAuditEvents(
      testDb,
      sql`action = 'skill.forked' and resource_id = ${fork.id}`,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.transport).toBe("api");
  });

  it("forks a skill into a team via its owner_id admin", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByUser(testDb, fixture.organizationId, fixture.userA.id);

    const fork = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      forkSkill(tx, fixture.team1Owner, source.id, { ownerType: "team", ownerId: fixture.team1Id }),
    );

    expect(fork.ownerType).toBe("team");
    expect(fork.ownerId).toBe(fixture.team1Id);
  });

  it("rejects a team-fork attempt from a non-admin, non-owner member", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByUser(testDb, fixture.organizationId, fixture.userA.id);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        forkSkill(tx, fixture.userB, source.id, { ownerType: "team", ownerId: fixture.team1Id }),
      ),
    ).rejects.toBeInstanceOf(SubscriberNotAuthorizedError);
  });

  it("rejects a cross-org fork attempt", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByUser(testDb, fixture.organizationId, fixture.userA.id);

    await expect(
      withTenantContext(testDb.appDb, fixture.otherOrgId, (tx) =>
        forkSkill(tx, fixture.otherOrgUser, source.id, {
          ownerType: "user",
          ownerId: fixture.otherOrgUser.id,
        }),
      ),
    ).rejects.toBeInstanceOf(SourceSkillNotFoundError);

    const rows = await queryPromptRows(testDb, sql`forked_from_skill_id = ${source.id}`);
    expect(rows).toHaveLength(0);
  });

  it("rejects a team owner id belonging to a different organization", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByUser(testDb, fixture.organizationId, fixture.userA.id);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        forkSkill(tx, fixture.orgAdmin, source.id, {
          ownerType: "team",
          ownerId: fixture.otherOrgTeamId,
        }),
      ),
    ).rejects.toBeInstanceOf(CrossOrgSubscriberError);
  });

  it("rejects forking a skill into an owner that already owns it (FR-021)", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByUser(testDb, fixture.organizationId, fixture.userA.id);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        forkSkill(tx, fixture.userA, source.id, { ownerType: "user", ownerId: fixture.userA.id }),
      ),
    ).rejects.toBeInstanceOf(CannotForkOwnSkillError);
  });

  it("keeps the fork independent from later publishes on the source", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByUser(
      testDb,
      fixture.organizationId,
      fixture.userA.id,
      "independence-source",
    );
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      publishVersion(tx, { organizationId: fixture.organizationId, userId: fixture.userA.id }, {
        organizationId: fixture.organizationId,
        promptName: "independence-source",
        version: "v1",
      }),
    );

    const fork = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      forkSkill(tx, fixture.userB, source.id, { ownerType: "user", ownerId: fixture.userB.id }),
    );
    const forkVersionAfterFork = fork.activeVersionId;

    // Publish a new version on the source — the fork must be unaffected.
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      publishVersion(tx, { organizationId: fixture.organizationId, userId: fixture.userA.id }, {
        organizationId: fixture.organizationId,
        promptName: "independence-source",
        version: "v2",
      }),
    );

    const forkAfter = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      getPromptById(tx, fixture.organizationId, fork.id),
    );
    expect(forkAfter?.activeVersionId).toBe(forkVersionAfterFork);
  });

  it("keeps the source independent from later publishes on the fork", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByUser(
      testDb,
      fixture.organizationId,
      fixture.userA.id,
      "reverse-independence-source",
    );
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      publishVersion(tx, { organizationId: fixture.organizationId, userId: fixture.userA.id }, {
        organizationId: fixture.organizationId,
        promptName: "reverse-independence-source",
        version: "v1",
      }),
    );

    const fork = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      forkSkill(tx, fixture.userB, source.id, { ownerType: "user", ownerId: fixture.userB.id }),
    );

    const sourceBefore = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      getPromptById(tx, fixture.organizationId, source.id),
    );

    // Publish a new version on the fork — the source must be unaffected.
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      publishVersion(tx, { organizationId: fixture.organizationId, userId: fixture.userB.id }, {
        organizationId: fixture.organizationId,
        promptName: fork.name,
        version: "v2",
      }),
    );

    const sourceAfter = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      getPromptById(tx, fixture.organizationId, source.id),
    );
    expect(sourceAfter?.activeVersionId).toBe(sourceBefore?.activeVersionId);
  });

  it("sets forkedFromSkillId to the immediate source when forking a fork, not the original root", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const root = await createTestSkillOwnedByUser(testDb, fixture.organizationId, fixture.userA.id);

    const firstFork = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      forkSkill(tx, fixture.userB, root.id, { ownerType: "user", ownerId: fixture.userB.id }),
    );
    expect(firstFork.forkedFromSkillId).toBe(root.id);

    const secondFork = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      forkSkill(tx, fixture.team1Owner, firstFork.id, {
        ownerType: "team",
        ownerId: fixture.team1Id,
      }),
    );
    expect(secondFork.forkedFromSkillId).toBe(firstFork.id);
    expect(secondFork.forkedFromSkillId).not.toBe(root.id);
  });
});
