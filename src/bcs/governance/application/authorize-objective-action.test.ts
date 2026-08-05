import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { ObjectiveNotAuthorizedError } from "../domain/objective";
import { assertCanManageObjective } from "./authorize-objective-action";
import {
  createObjectiveFixtureUser,
  makeObjectiveFixtureOrg,
  type ObjectiveFixtureOrg,
} from "./objective-test-helpers";

async function setRole(testDb: TestDb, userId: string, role: "admin" | "member"): Promise<void> {
  await testDb.ownerDb.execute(sql`update identity_access.users set role = ${role} where id = ${userId}`);
}

async function setTeamOwner(testDb: TestDb, teamId: string, ownerId: string | null): Promise<void> {
  await testDb.ownerDb.execute(sql`update identity_access.teams set owner_id = ${ownerId} where id = ${teamId}`);
}

describe("assertCanManageObjective", () => {
  let testDb: TestDb;
  let fixture: ObjectiveFixtureOrg;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  describe("team scope", () => {
    it("allows an org admin", async () => {
      fixture = await makeObjectiveFixtureOrg(testDb);
      await setTeamOwner(testDb, fixture.teamId, null);

      await expect(
        withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
          assertCanManageObjective(tx, fixture.actor, { teamId: fixture.teamId, projectId: null, userId: null }),
        ),
      ).resolves.toBeUndefined();
    });

    it("allows the team's own owner without the admin role", async () => {
      fixture = await makeObjectiveFixtureOrg(testDb);
      await setRole(testDb, fixture.userId, "member");
      await setTeamOwner(testDb, fixture.teamId, fixture.userId);

      await expect(
        withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
          assertCanManageObjective(tx, fixture.actor, { teamId: fixture.teamId, projectId: null, userId: null }),
        ),
      ).resolves.toBeUndefined();
    });

    it("rejects a plain member who does not own the team", async () => {
      fixture = await makeObjectiveFixtureOrg(testDb);
      await setRole(testDb, fixture.userId, "member");
      const otherOwnerId = await createObjectiveFixtureUser(testDb, fixture, fixture.teamId);
      await setTeamOwner(testDb, fixture.teamId, otherOwnerId);

      await expect(
        withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
          assertCanManageObjective(tx, fixture.actor, { teamId: fixture.teamId, projectId: null, userId: null }),
        ),
      ).rejects.toBeInstanceOf(ObjectiveNotAuthorizedError);
    });
  });

  describe("user (person) scope", () => {
    it("allows the exact user acting for themselves, even without the admin role", async () => {
      fixture = await makeObjectiveFixtureOrg(testDb);
      await setRole(testDb, fixture.userId, "member");

      await expect(
        withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
          assertCanManageObjective(tx, fixture.actor, { teamId: null, projectId: null, userId: fixture.userId }),
        ),
      ).resolves.toBeUndefined();
    });

    it("rejects an org admin acting for a different person's objective (no admin override)", async () => {
      fixture = await makeObjectiveFixtureOrg(testDb);

      await expect(
        withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
          assertCanManageObjective(tx, fixture.actor, { teamId: null, projectId: null, userId: randomUUID() }),
        ),
      ).rejects.toBeInstanceOf(ObjectiveNotAuthorizedError);
    });
  });

  describe("project scope", () => {
    it("allows an org admin", async () => {
      fixture = await makeObjectiveFixtureOrg(testDb);

      await expect(
        withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
          assertCanManageObjective(tx, fixture.actor, { teamId: null, projectId: fixture.projectId, userId: null }),
        ),
      ).resolves.toBeUndefined();
    });

    it("rejects a non-admin", async () => {
      fixture = await makeObjectiveFixtureOrg(testDb);
      await setRole(testDb, fixture.userId, "member");

      await expect(
        withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
          assertCanManageObjective(tx, fixture.actor, { teamId: null, projectId: fixture.projectId, userId: null }),
        ),
      ).rejects.toBeInstanceOf(ObjectiveNotAuthorizedError);
    });
  });
});
