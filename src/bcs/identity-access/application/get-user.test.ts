import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withTenantContext } from "@/shared/db/tenant-context";
import { insert as insertOrg } from "../infrastructure/organizations-repo";
import { insert as insertTeam } from "../infrastructure/teams-repo";
import { insertValidatedUser } from "./insert-validated-user";
import { getUser } from "./get-user";
import { CrossOrgUserAccessError } from "../domain/user";

describe("getUser", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  async function makeUser(name: string) {
    const { id: organizationId } = await insertOrg(testDb.authDb, {
      name,
      slug: `${name}-${randomUUID()}`,
    });
    const { id: teamId } = await insertTeam(testDb.authDb, {
      organizationId,
      name: "Root",
      slug: `root-${randomUUID()}`,
    });
    const { id: userId } = await insertValidatedUser(testDb.authDb, {
      organizationId,
      teamId,
      username: `jdoe-${randomUUID()}`,
      displayName: "Jane Doe",
      email: `jane-${randomUUID()}@example.com`,
      password: "password123",
      role: "admin",
    });
    return { organizationId, teamId, userId };
  }

  it("returns the exact UserSummary shape for an existing user, scoped to its organization", async () => {
    const { organizationId, teamId, userId } = await makeUser("get-user-shape");

    const summary = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      getUser(tx, userId, organizationId),
    );

    expect(summary).toEqual({
      id: userId,
      orgId: organizationId,
      teamId,
      role: "admin",
      email: summary.email,
    });
    expect(Object.keys(summary).sort()).toEqual(
      ["email", "id", "orgId", "role", "teamId"].sort(),
    );
  });

  it("throws for a nonexistent id when scoped to an organization", async () => {
    const { organizationId } = await makeUser("get-user-missing");
    await expect(
      withTenantContext(testDb.appDb, organizationId, (tx) =>
        getUser(tx, randomUUID(), organizationId),
      ),
    ).rejects.toBeInstanceOf(CrossOrgUserAccessError);
  });

  it("throws for a user id that belongs to a different organization (M1/M3)", async () => {
    const orgA = await makeUser("get-user-org-a");
    const orgB = await makeUser("get-user-org-b");

    await expect(
      withTenantContext(testDb.appDb, orgA.organizationId, (tx) =>
        getUser(tx, orgB.userId, orgA.organizationId),
      ),
    ).rejects.toBeInstanceOf(CrossOrgUserAccessError);
  });

  it("with no organizationId, falls back to an unscoped lookup — the path authenticateSession relies on", async () => {
    const { userId } = await makeUser("get-user-unscoped");
    const summary = await getUser(testDb.authDb, userId);
    expect(summary.id).toBe(userId);
  });

  it("with no organizationId, still throws for a nonexistent id", async () => {
    await expect(getUser(testDb.authDb, randomUUID())).rejects.toThrow();
  });
});
