import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { countForksOfSkill } from "./count-forks-of-skill";
import { forkSkill } from "./fork-skill";
import { publishVersion } from "./publish-version";
import { createTestSkillOwnedByUser, makeSubscriptionFixtureOrg } from "./subscription-test-helpers";

describe("countForksOfSkill", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("returns 0 for a skill nobody has forked", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByUser(testDb, fixture.organizationId, fixture.userA.id);

    const count = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      countForksOfSkill(tx, fixture.organizationId, source.id),
    );

    expect(count).toBe(0);
  });

  it("counts every skill forked from the source, regardless of the fork's owner", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByUser(testDb, fixture.organizationId, fixture.userA.id, "fork-source");
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      publishVersion(tx, { organizationId: fixture.organizationId, userId: fixture.userA.id }, {
        organizationId: fixture.organizationId,
        promptName: "fork-source",
        version: "v1",
        mainFile: { content: "Be helpful." },
        tags: [],
      }),
    );

    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      forkSkill(tx, fixture.userB, source.id, { ownerType: "user", ownerId: fixture.userB.id }),
    );
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      forkSkill(tx, fixture.team1Owner, source.id, { ownerType: "team", ownerId: fixture.team1Id }),
    );

    const count = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      countForksOfSkill(tx, fixture.organizationId, source.id),
    );

    expect(count).toBe(2);
  });

  it("is scoped to the given organization", async () => {
    const fixtureA = await makeSubscriptionFixtureOrg(testDb);
    const fixtureB = await makeSubscriptionFixtureOrg(testDb);
    const sourceB = await createTestSkillOwnedByUser(
      testDb,
      fixtureB.organizationId,
      fixtureB.userA.id,
      "fork-source-b",
    );
    await withTenantContext(testDb.appDb, fixtureB.organizationId, (tx) =>
      publishVersion(tx, { organizationId: fixtureB.organizationId, userId: fixtureB.userA.id }, {
        organizationId: fixtureB.organizationId,
        promptName: "fork-source-b",
        version: "v1",
        mainFile: { content: "Be helpful." },
        tags: [],
      }),
    );
    await withTenantContext(testDb.appDb, fixtureB.organizationId, (tx) =>
      forkSkill(tx, fixtureB.userB, sourceB.id, { ownerType: "user", ownerId: fixtureB.userB.id }),
    );

    const count = await withTenantContext(testDb.appDb, fixtureA.organizationId, (tx) =>
      countForksOfSkill(tx, fixtureA.organizationId, sourceB.id),
    );

    expect(count).toBe(0);
  });
});
