import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { listSkillsByOrganization } from "./list-skills-by-organization";
import {
  createTestSkillOwnedByTeam,
  createTestSkillOwnedByUser,
  makeSubscriptionFixtureOrg,
} from "./subscription-test-helpers";

describe("listSkillsByOrganization", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("returns every skill in the organization regardless of ownership or subscription (FR-019/FR-020/SC-007)", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const ownedByUserA = await createTestSkillOwnedByUser(testDb, fixture.organizationId, fixture.userA.id);
    const ownedByUserB = await createTestSkillOwnedByUser(testDb, fixture.organizationId, fixture.userB.id);
    const ownedByTeam2 = await createTestSkillOwnedByTeam(testDb, fixture.organizationId, fixture.team2Id);

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      listSkillsByOrganization(tx, fixture.organizationId),
    );

    const ids = result.map((s) => s.id);
    // Every skill appears, even those userB neither owns, subscribes to, nor
    // shares a team with — discoverability never depends on any
    // relationship to the skill.
    expect(ids).toContain(ownedByUserA.id);
    expect(ids).toContain(ownedByUserB.id);
    expect(ids).toContain(ownedByTeam2.id);
  });

  it("excludes skills belonging to a different organization", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const otherFixture = await makeSubscriptionFixtureOrg(testDb);
    const otherOrgSkill = await createTestSkillOwnedByUser(
      testDb,
      otherFixture.organizationId,
      otherFixture.userA.id,
    );

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      listSkillsByOrganization(tx, fixture.organizationId),
    );

    expect(result.map((s) => s.id)).not.toContain(otherOrgSkill.id);
  });
});
