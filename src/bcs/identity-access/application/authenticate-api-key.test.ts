import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import type { UserSummary } from "../domain/user";
import { insert as insertOrg } from "../infrastructure/organizations-repo";
import { insert as insertTeam } from "../infrastructure/teams-repo";
import { insert as insertUser, update as updateUserRow } from "../infrastructure/users-repo";
import { createApiKey } from "./create-api-key";
import { authenticateApiKey } from "./authenticate-api-key";

async function makeUser(
  testDb: TestDb,
  role: "admin" | "member" = "member",
): Promise<UserSummary> {
  const { id: organizationId } = await insertOrg(testDb.authDb, {
    name: "Acme",
    slug: `acme-${randomUUID()}`,
  });
  const { id: teamId } = await insertTeam(testDb.authDb, {
    organizationId,
    name: "Root",
    slug: `root-${randomUUID()}`,
  });
  const email = `user-${randomUUID()}@example.com`;
  const { id } = await insertUser(testDb.authDb, {
    organizationId,
    teamId,
    username: `user-${randomUUID()}`,
    displayName: "User",
    email,
    passwordHash: "hash",
    role,
  });
  return { id, orgId: organizationId, teamId, role, email };
}

describe("authenticateApiKey", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("resolves the correct user, organization, and scopes for a valid key", async () => {
    const user = await makeUser(testDb, "member");
    const { rawKey } = await createApiKey(testDb.authDb, user, {
      name: "My IDE",
      scopes: ["prompts:read"],
    });

    const result = await authenticateApiKey(testDb.authDb, rawKey);

    expect(result?.user.id).toBe(user.id);
    expect(result?.user.orgId).toBe(user.orgId);
    expect(result?.scopes).toEqual(["prompts:read"]);
  });

  it("returns null for an unrecognized or malformed key, without throwing", async () => {
    const result = await authenticateApiKey(testDb.authDb, "not-a-real-key");
    expect(result).toBeNull();
  });

  it("returns null for a revoked key", async () => {
    const admin = await makeUser(testDb, "admin");
    const { rawKey } = await createApiKey(testDb.authDb, admin, {
      name: "My IDE",
      scopes: ["prompts:read"],
    });
    // Revoke directly via the repo — revokeApiKey (US3) isn't implemented yet.
    const { markRevoked, findByHash } = await import("../infrastructure/api-keys-repo");
    const { createHash } = await import("node:crypto");
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    const row = await findByHash(testDb.authDb, keyHash);
    await markRevoked(testDb.authDb, row!.id);

    const result = await authenticateApiKey(testDb.authDb, rawKey);
    expect(result).toBeNull();
  });

  it("returns null for an expired key even while still active", async () => {
    const admin = await makeUser(testDb, "admin");
    const { rawKey } = await createApiKey(testDb.authDb, admin, {
      name: "My IDE",
      scopes: ["prompts:read"],
      expiresAt: new Date(Date.now() - 1000),
    });

    const result = await authenticateApiKey(testDb.authDb, rawKey);
    expect(result).toBeNull();
  });

  it("returns null when the owning user has been deactivated", async () => {
    const admin = await makeUser(testDb, "admin");
    const { rawKey } = await createApiKey(testDb.authDb, admin, {
      name: "My IDE",
      scopes: ["prompts:read"],
    });
    await updateUserRow(testDb.authDb, admin.id, { isActive: false });

    const result = await authenticateApiKey(testDb.authDb, rawKey);
    expect(result).toBeNull();
  });

  it("returns null when the owning user has been unassigned from every team (019-account-team-settings-ui)", async () => {
    const admin = await makeUser(testDb, "admin");
    const { rawKey } = await createApiKey(testDb.authDb, admin, {
      name: "My IDE",
      scopes: ["prompts:read"],
    });
    await updateUserRow(testDb.authDb, admin.id, { teamId: null });

    const result = await authenticateApiKey(testDb.authDb, rawKey);
    expect(result).toBeNull();
  });

  it("updates last_used_at on a successful authentication", async () => {
    const admin = await makeUser(testDb, "admin");
    const { rawKey } = await createApiKey(testDb.authDb, admin, {
      name: "My IDE",
      scopes: ["prompts:read"],
    });

    await authenticateApiKey(testDb.authDb, rawKey);

    const { createHash } = await import("node:crypto");
    const { findByHash } = await import("../infrastructure/api-keys-repo");
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    const row = await findByHash(testDb.authDb, keyHash);
    expect(row?.lastUsedAt).toBeInstanceOf(Date);
  });

  it("does not update last_used_at on a failed authentication", async () => {
    const admin = await makeUser(testDb, "admin");
    const { rawKey } = await createApiKey(testDb.authDb, admin, {
      name: "My IDE",
      scopes: ["prompts:read"],
      expiresAt: new Date(Date.now() - 1000),
    });

    await authenticateApiKey(testDb.authDb, rawKey);

    const { createHash } = await import("node:crypto");
    const { findByHash } = await import("../infrastructure/api-keys-repo");
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    const row = await findByHash(testDb.authDb, keyHash);
    expect(row?.lastUsedAt).toBeNull();
  });

  it("still authenticates with the originally-granted scope after the owner's role is downgraded (FR-003 is creation-time-only)", async () => {
    const admin = await makeUser(testDb, "admin");
    const { rawKey } = await createApiKey(testDb.authDb, admin, {
      name: "CI job",
      scopes: ["prompts:write"],
    });

    await updateUserRow(testDb.authDb, admin.id, { role: "member" });

    const result = await authenticateApiKey(testDb.authDb, rawKey);
    expect(result?.scopes).toEqual(["prompts:write"]);
  });
});
