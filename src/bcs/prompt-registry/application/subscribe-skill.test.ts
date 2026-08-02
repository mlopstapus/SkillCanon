import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import {
  CannotSubscribeToOwnSkillError,
  CrossOrgSubscriberError,
  DuplicateSubscriptionError,
  SourceSkillNotFoundError,
  SubscriberNotAuthorizedError,
} from "../domain/subscription";
import { getPromptById } from "./get-prompt-by-id";
import { publishVersion } from "./publish-version";
import { subscribeSkill } from "./subscribe-skill";
import {
  createTestSkillOwnedByUser,
  makeSubscriptionFixtureOrg,
  querySubscriptionAuditEvents,
  querySubscriptionRows,
} from "./subscription-test-helpers";

describe("subscribeSkill", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("subscribes a user to another user's skill and records a SkillSubscribed audit event", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByUser(testDb, fixture.organizationId, fixture.userA.id);

    const subscription = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      subscribeSkill(
        tx,
        fixture.userB,
        source.id,
        { subscriberType: "user", subscriberId: fixture.userB.id },
        { transport: "api", sourceIp: "10.0.0.1" },
      ),
    );

    expect(subscription.sourceSkillId).toBe(source.id);
    expect(subscription.subscriberType).toBe("user");
    expect(subscription.subscriberId).toBe(fixture.userB.id);

    const rows = await querySubscriptionRows(testDb, sql`id = ${subscription.id}`);
    expect(rows).toHaveLength(1);

    const events = await querySubscriptionAuditEvents(
      testDb,
      sql`action = 'skill.subscribed' and resource_id = ${subscription.id}`,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.transport).toBe("api");
  });

  it("subscribes a team via its owner_id admin, recorded under the team not the individual", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByUser(testDb, fixture.organizationId, fixture.userA.id);

    const subscription = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      subscribeSkill(tx, fixture.team1Owner, source.id, {
        subscriberType: "team",
        subscriberId: fixture.team1Id,
      }),
    );

    expect(subscription.subscriberType).toBe("team");
    expect(subscription.subscriberId).toBe(fixture.team1Id);
  });

  it("allows an org admin to subscribe a team they don't own", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByUser(testDb, fixture.organizationId, fixture.userA.id);

    const subscription = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      subscribeSkill(tx, fixture.orgAdmin, source.id, {
        subscriberType: "team",
        subscriberId: fixture.team2Id,
      }),
    );

    expect(subscription.subscriberId).toBe(fixture.team2Id);
  });

  it("rejects a team-subscribe attempt from a non-admin, non-owner member", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByUser(testDb, fixture.organizationId, fixture.userA.id);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        subscribeSkill(tx, fixture.userB, source.id, {
          subscriberType: "team",
          subscriberId: fixture.team1Id,
        }),
      ),
    ).rejects.toBeInstanceOf(SubscriberNotAuthorizedError);
  });

  it("rejects a cross-org subscribe attempt, creating no row and no audit event", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByUser(testDb, fixture.organizationId, fixture.userA.id);

    await expect(
      withTenantContext(testDb.appDb, fixture.otherOrgId, (tx) =>
        subscribeSkill(tx, fixture.otherOrgUser, source.id, {
          subscriberType: "user",
          subscriberId: fixture.otherOrgUser.id,
        }),
      ),
    ).rejects.toBeInstanceOf(SourceSkillNotFoundError);

    const rows = await querySubscriptionRows(testDb, sql`source_skill_id = ${source.id}`);
    expect(rows).toHaveLength(0);
    const events = await querySubscriptionAuditEvents(
      testDb,
      sql`action = 'skill.subscribed' and resource_id in (select id from prompt_registry.subscriptions where source_skill_id = ${source.id})`,
    );
    expect(events).toHaveLength(0);
  });

  it("rejects a team subscriber id belonging to a different organization", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByUser(testDb, fixture.organizationId, fixture.userA.id);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        subscribeSkill(tx, fixture.orgAdmin, source.id, {
          subscriberType: "team",
          subscriberId: fixture.otherOrgTeamId,
        }),
      ),
    ).rejects.toBeInstanceOf(CrossOrgSubscriberError);
  });

  it("rejects a duplicate subscribe attempt", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByUser(testDb, fixture.organizationId, fixture.userA.id);

    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      subscribeSkill(tx, fixture.userB, source.id, {
        subscriberType: "user",
        subscriberId: fixture.userB.id,
      }),
    );

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        subscribeSkill(tx, fixture.userB, source.id, {
          subscriberType: "user",
          subscriberId: fixture.userB.id,
        }),
      ),
    ).rejects.toBeInstanceOf(DuplicateSubscriptionError);
  });

  it("rejects subscribing to a skill the subscriber already owns", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByUser(testDb, fixture.organizationId, fixture.userA.id);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        subscribeSkill(tx, fixture.userA, source.id, {
          subscriberType: "user",
          subscriberId: fixture.userA.id,
        }),
      ),
    ).rejects.toBeInstanceOf(CannotSubscribeToOwnSkillError);
  });

  it("resolves a newly published version with no additional action from the subscriber", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByUser(
      testDb,
      fixture.organizationId,
      fixture.userA.id,
      "live-ref-prompt",
    );

    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      subscribeSkill(tx, fixture.userB, source.id, {
        subscriberType: "user",
        subscriberId: fixture.userB.id,
      }),
    );

    const v1 = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      publishVersion(tx, { organizationId: fixture.organizationId, userId: fixture.userA.id }, {
        organizationId: fixture.organizationId,
        promptName: "live-ref-prompt",
        version: "v1",
        userTemplate: "{{input}}",
      }),
    );

    let resolved = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      getPromptById(tx, fixture.organizationId, source.id),
    );
    expect(resolved?.activeVersionId).toBe(v1.id);

    const v2 = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      publishVersion(tx, { organizationId: fixture.organizationId, userId: fixture.userA.id }, {
        organizationId: fixture.organizationId,
        promptName: "live-ref-prompt",
        version: "v2",
        userTemplate: "{{input}}",
      }),
    );

    // No action taken by the subscriber — reading the skill now resolves v2.
    resolved = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      getPromptById(tx, fixture.organizationId, source.id),
    );
    expect(resolved?.activeVersionId).toBe(v2.id);
  });
});
