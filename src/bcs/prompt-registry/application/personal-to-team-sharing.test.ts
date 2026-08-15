import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import * as promptRegistry from "../index";
import { forkSkill } from "./fork-skill";
import { subscribeSkill } from "./subscribe-skill";
import {
  createTestSkillOwnedByUser,
  makeSubscriptionFixtureOrg,
  queryPromptRows,
} from "./subscription-test-helpers";

describe("A personal skill becomes team-owned (US3)", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("forking a personal skill into a team leaves the original owner_type/owner_id unchanged", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const original = await createTestSkillOwnedByUser(testDb, fixture.organizationId, fixture.userA.id);

    const fork = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      forkSkill(tx, fixture.team1Owner, original.id, {
        ownerType: "team",
        ownerId: fixture.team1Id,
        name: "personal-to-team-fork",
      }),
    );

    expect(fork.ownerType).toBe("team");
    expect(fork.ownerId).toBe(fixture.team1Id);

    const originalRows = await queryPromptRows(testDb, sql`id = ${original.id}`);
    expect(originalRows).toHaveLength(1);
    expect(originalRows[0]?.owner_type).toBe("user");
    expect(originalRows[0]?.owner_id).toBe(fixture.userA.id);
  });

  it("a team subscribing to a personal skill leaves the original owner_type/owner_id unchanged", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const original = await createTestSkillOwnedByUser(testDb, fixture.organizationId, fixture.userA.id);

    const subscription = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      subscribeSkill(tx, fixture.team1Owner, original.id, {
        subscriberType: "team",
        subscriberId: fixture.team1Id,
      }),
    );

    expect(subscription.subscriberType).toBe("team");
    expect(subscription.subscriberId).toBe(fixture.team1Id);

    const originalRows = await queryPromptRows(testDb, sql`id = ${original.id}`);
    expect(originalRows).toHaveLength(1);
    expect(originalRows[0]?.owner_type).toBe("user");
    expect(originalRows[0]?.owner_id).toBe(fixture.userA.id);
  });

  it("no function exported from this bounded context's public API can reassign an existing skill's owner in place", () => {
    // Characterization check (mirrors prompt-characterization.test.ts): the
    // only way a *new* owner ever gains a version of a skill is a new
    // Subscription row or a new forked Prompt row (PDR-016) — there is no
    // "reassign owner" operation anywhere, and this asserts none was ever
    // added to the public barrel.
    const exportNames = Object.keys(promptRegistry);
    const ownerMutators = exportNames.filter((name) => {
      const lower = name.toLowerCase();
      return (
        lower.includes("reassign") ||
        lower.includes("transferowner") ||
        lower.includes("changeowner") ||
        lower.includes("setowner") ||
        lower.includes("updateowner")
      );
    });
    expect(ownerMutators).toHaveLength(0);
  });
});
