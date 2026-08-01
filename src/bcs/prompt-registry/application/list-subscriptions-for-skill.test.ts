import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { listSubscriptionsForSkill } from "./list-subscriptions-for-skill";
import { subscribeSkill } from "./subscribe-skill";
import { createTestSkillOwnedByUser, makeSubscriptionFixtureOrg } from "./subscription-test-helpers";

describe("listSubscriptionsForSkill", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("returns every grant on a skill, across subscriber kinds", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByUser(testDb, fixture.organizationId, fixture.userA.id);
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      subscribeSkill(tx, fixture.userB, source.id, { subscriberType: "user", subscriberId: fixture.userB.id }),
    );
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      subscribeSkill(tx, fixture.team1Owner, source.id, { subscriberType: "team", subscriberId: fixture.team1Id }),
    );

    const rows = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      listSubscriptionsForSkill(tx, fixture.organizationId, source.id),
    );

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.subscriberType).sort()).toEqual(["team", "user"]);
  });

  it("does not return another organization's subscriptions", async () => {
    const fixtureA = await makeSubscriptionFixtureOrg(testDb);
    const fixtureB = await makeSubscriptionFixtureOrg(testDb);
    const sourceB = await createTestSkillOwnedByUser(testDb, fixtureB.organizationId, fixtureB.userA.id);
    await withTenantContext(testDb.appDb, fixtureB.organizationId, (tx) =>
      subscribeSkill(tx, fixtureB.userB, sourceB.id, { subscriberType: "user", subscriberId: fixtureB.userB.id }),
    );

    const rows = await withTenantContext(testDb.appDb, fixtureA.organizationId, (tx) =>
      listSubscriptionsForSkill(tx, fixtureA.organizationId, sourceB.id),
    );

    expect(rows).toHaveLength(0);
  });
});
