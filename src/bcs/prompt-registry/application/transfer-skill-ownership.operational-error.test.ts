import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Team } from "@/bcs/identity-access";
import { sql } from "drizzle-orm";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { SubscriberNotAuthorizedError } from "../domain/subscription";

const identityAccess = vi.hoisted(() => ({ getTeam: vi.fn() }));

vi.mock("@/bcs/identity-access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/bcs/identity-access")>()),
  getTeam: identityAccess.getTeam,
}));

import { transferSkillOwnership } from "./transfer-skill-ownership";
import {
  createTestSkillOwnedByTeam,
  createTestSkillOwnedByUser,
  makeSubscriptionFixtureOrg,
} from "./subscription-test-helpers";

function teamFixture(
  organizationId: string,
  id: string,
  ownerId: string,
): Team {
  return {
    id,
    organizationId,
    name: `Team ${id}`,
    slug: `team-${id}`,
    description: null,
    ownerId,
    parentTeamId: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("transferSkillOwnership operational failures and stale authorization", () => {
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

  it("propagates an operational source-authorization lookup failure for a non-admin", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByTeam(testDb, fixture.organizationId, fixture.team1Id);
    const operationalFailure = new Error("source team lookup unavailable");
    identityAccess.getTeam.mockRejectedValueOnce(operationalFailure);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        transferSkillOwnership(tx, fixture.team1Owner, source.id, {
          newOwnerType: "user",
          newOwnerId: fixture.team1Owner.id,
        }),
      ),
    ).rejects.toBe(operationalFailure);
  });

  it("propagates an operational destination-authorization lookup failure for a non-admin", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByUser(
      testDb,
      fixture.organizationId,
      fixture.team1Owner.id,
    );
    const destination = teamFixture(
      fixture.organizationId,
      fixture.team1Id,
      fixture.team1Owner.id,
    );
    const operationalFailure = new Error("destination authorization unavailable");
    identityAccess.getTeam
      .mockResolvedValueOnce(destination)
      .mockRejectedValueOnce(operationalFailure);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        transferSkillOwnership(tx, fixture.team1Owner, source.id, {
          newOwnerType: "team",
          newOwnerId: fixture.team1Id,
        }),
      ),
    ).rejects.toBe(operationalFailure);
  });

  it("does not let authorization for a stale source overwrite an intervening admin transfer", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByTeam(testDb, fixture.organizationId, fixture.team1Id);
    const oldSourceLookupStarted = deferred<void>();
    const releaseOldSourceLookup = deferred<void>();
    identityAccess.getTeam.mockImplementation(async (_db, organizationId, teamId) => {
      if (teamId === fixture.team1Id) {
        oldSourceLookupStarted.resolve();
        await releaseOldSourceLookup.promise;
        return teamFixture(organizationId, teamId, fixture.team1Owner.id);
      }
      if (teamId === fixture.team2Id) {
        return teamFixture(organizationId, teamId, fixture.team2Owner.id);
      }
      throw new Error(`Unexpected team lookup ${teamId}`);
    });

    const staleTransfer = withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      transferSkillOwnership(tx, fixture.team1Owner, source.id, {
        newOwnerType: "user",
        newOwnerId: fixture.team1Owner.id,
      }),
    );
    const staleExpectation = expect(staleTransfer).rejects.toBeInstanceOf(
      SubscriberNotAuthorizedError,
    );
    await oldSourceLookupStarted.promise;

    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      transferSkillOwnership(tx, fixture.orgAdmin, source.id, {
        newOwnerType: "team",
        newOwnerId: fixture.team2Id,
      }),
    );
    releaseOldSourceLookup.resolve();

    await staleExpectation;
    const [current] = await testDb.ownerDb.execute<{
      owner_type: "user" | "team";
      owner_id: string;
    }>(sql`
      select owner_type, owner_id
      from prompt_registry.prompts
      where id = ${source.id}
    `);
    const events = await testDb.ownerDb.execute(sql`
      select id
      from audit.audit_events
      where action = 'skill.owner_transferred' and resource_id = ${source.id}
    `);

    expect(current).toMatchObject({ owner_type: "team", owner_id: fixture.team2Id });
    expect(Array.from(events)).toHaveLength(1);
  });
});
