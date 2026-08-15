import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";

const identityAccess = vi.hoisted(() => ({ getTeam: vi.fn() }));

vi.mock("@/bcs/identity-access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/bcs/identity-access")>()),
  getTeam: identityAccess.getTeam,
}));

import { transferSkillOwnership } from "./transfer-skill-ownership";
import {
  createTestSkillOwnedByTeam,
  makeSubscriptionFixtureOrg,
} from "./subscription-test-helpers";

describe("transferSkillOwnership operational destination failures", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  beforeEach(() => {
    identityAccess.getTeam.mockReset();
  });

  it("propagates an operational destination lookup failure", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByTeam(testDb, fixture.organizationId, fixture.team1Id);
    const operationalFailure = new Error("database connection lost");
    identityAccess.getTeam.mockRejectedValueOnce(operationalFailure);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        transferSkillOwnership(tx, fixture.orgAdmin, source.id, {
          newOwnerType: "team",
          newOwnerId: fixture.team2Id,
        }),
      ),
    ).rejects.toBe(operationalFailure);
  });
});
