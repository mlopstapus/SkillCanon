import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { SubscriberNotAuthorizedError, SubscriptionNotFoundError } from "../domain/subscription";
import { listPrompts } from "./list-prompts";
import { subscribeSkill } from "./subscribe-skill";
import {
  createTestSkillOwnedByUser,
  makeSubscriptionFixtureOrg,
  querySubscriptionAuditEvents,
  querySubscriptionRows,
} from "./subscription-test-helpers";
import { unsubscribeSkill } from "./unsubscribe-skill";

describe("unsubscribeSkill", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("lets a subscriber remove their own subscription and records a SkillUnsubscribed audit event", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByUser(
      testDb,
      fixture.organizationId,
      fixture.userA.id,
      "unsub-source",
    );

    const subscription = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      subscribeSkill(tx, fixture.userB, source.id, {
        subscriberType: "user",
        subscriberId: fixture.userB.id,
      }),
    );

    const accessibleBefore = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      listPrompts(tx, { organizationId: fixture.organizationId, userId: fixture.userB.id }),
    );
    expect(accessibleBefore.map((p) => p.id)).toContain(source.id);

    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      unsubscribeSkill(tx, fixture.userB, subscription.id, { transport: "api", sourceIp: "10.0.0.3" }),
    );

    const rows = await querySubscriptionRows(testDb, sql`id = ${subscription.id}`);
    expect(rows).toHaveLength(0);

    const events = await querySubscriptionAuditEvents(
      testDb,
      sql`action = 'skill.unsubscribed' and resource_id = ${subscription.id}`,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.transport).toBe("api");

    const accessibleAfter = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      listPrompts(tx, { organizationId: fixture.organizationId, userId: fixture.userB.id }),
    );
    expect(accessibleAfter.map((p) => p.id)).not.toContain(source.id);

    // The subscriber's own skills are unaffected.
    const ownSkill = await createTestSkillOwnedByUser(testDb, fixture.organizationId, fixture.userB.id);
    const accessibleOwnedCheck = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      listPrompts(tx, { organizationId: fixture.organizationId, userId: fixture.userB.id }),
    );
    expect(accessibleOwnedCheck.map((p) => p.id)).toContain(ownSkill.id);
  });

  it("lets a team's owner-admin unsubscribe a team subscription; a non-admin member is rejected", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByUser(testDb, fixture.organizationId, fixture.userA.id);

    const subscription = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      subscribeSkill(tx, fixture.team1Owner, source.id, {
        subscriberType: "team",
        subscriberId: fixture.team1Id,
      }),
    );

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        unsubscribeSkill(tx, fixture.userB, subscription.id),
      ),
    ).rejects.toBeInstanceOf(SubscriberNotAuthorizedError);

    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      unsubscribeSkill(tx, fixture.team1Owner, subscription.id),
    );

    const rows = await querySubscriptionRows(testDb, sql`id = ${subscription.id}`);
    expect(rows).toHaveLength(0);
  });

  it("rejects unsubscribing a nonexistent subscription, with no side effects", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        unsubscribeSkill(tx, fixture.userB, randomUUID()),
      ),
    ).rejects.toBeInstanceOf(SubscriptionNotFoundError);

    const events = await querySubscriptionAuditEvents(
      testDb,
      sql`action = 'skill.unsubscribed' and organization_id = ${fixture.organizationId}`,
    );
    expect(events).toHaveLength(0);
  });

  it("rejects unsubscribing a subscription the caller has no authority over", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByUser(testDb, fixture.organizationId, fixture.userA.id);

    const subscription = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      subscribeSkill(tx, fixture.userB, source.id, {
        subscriberType: "user",
        subscriberId: fixture.userB.id,
      }),
    );

    // fixture.orgAdmin has no relationship to userB's personal subscription —
    // an org admin's authority under assertAuthorizedForOwner only covers
    // team-scoped actions, never another individual's own subscription.
    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        unsubscribeSkill(tx, fixture.orgAdmin, subscription.id),
      ),
    ).rejects.toBeInstanceOf(SubscriberNotAuthorizedError);

    const rows = await querySubscriptionRows(testDb, sql`id = ${subscription.id}`);
    expect(rows).toHaveLength(1);
  });
});
