import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { PolicyNotAuthorizedError } from "../domain/policy";
import { assertCanManagePolicyForTeam } from "./authorize-policy-action";
import { createPolicyFixtureUser, makePolicyFixtureOrg, type PolicyFixtureOrg } from "./policy-test-helpers";

async function setRole(testDb: TestDb, userId: string, role: "admin" | "member"): Promise<void> {
  await testDb.ownerDb.execute(sql`update identity_access.users set role = ${role} where id = ${userId}`);
}

async function setTeamOwner(testDb: TestDb, teamId: string, ownerId: string | null): Promise<void> {
  await testDb.ownerDb.execute(sql`update identity_access.teams set owner_id = ${ownerId} where id = ${teamId}`);
}

describe("assertCanManagePolicyForTeam", () => {
  let testDb: TestDb;
  let fixture: PolicyFixtureOrg;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("allows an org admin, regardless of team ownership", async () => {
    fixture = await makePolicyFixtureOrg(testDb);
    await setTeamOwner(testDb, fixture.teamId, null);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        assertCanManagePolicyForTeam(tx, fixture.actor, fixture.teamId),
      ),
    ).resolves.toBeUndefined();
  });

  it("allows the team's own owner, even without the admin role", async () => {
    fixture = await makePolicyFixtureOrg(testDb);
    await setRole(testDb, fixture.userId, "member");
    await setTeamOwner(testDb, fixture.teamId, fixture.userId);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        assertCanManagePolicyForTeam(tx, fixture.actor, fixture.teamId),
      ),
    ).resolves.toBeUndefined();
  });

  it("rejects a plain member who does not own the team", async () => {
    fixture = await makePolicyFixtureOrg(testDb);
    await setRole(testDb, fixture.userId, "member");
    const otherOwnerId = await createPolicyFixtureUser(testDb, fixture, fixture.teamId);
    await setTeamOwner(testDb, fixture.teamId, otherOwnerId);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        assertCanManagePolicyForTeam(tx, fixture.actor, fixture.teamId),
      ),
    ).rejects.toBeInstanceOf(PolicyNotAuthorizedError);
  });
});
