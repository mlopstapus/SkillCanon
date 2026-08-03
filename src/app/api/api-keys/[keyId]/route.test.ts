import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiKey, createUser } from "@/bcs/identity-access";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withApiRoute } from "@/shared/api/handler";
import { loginAndBuildCookie, seedOrgWithAdmin, type SeededOrg } from "@/shared/api/test-helpers";
import { handleDelete } from "./route";

describe("/api/api-keys/[keyId]", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  beforeEach(() => {
    vi.stubEnv("STRIPE_ENABLED", "true");
    vi.stubEnv("JWT_SECRET", "a-real-signing-secret-for-tests");
    vi.stubEnv("JWT_EXPIRY_HOURS", "24");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function route() {
    return withApiRoute(handleDelete, { authDb: testDb.authDb, db: testDb.appDb });
  }

  async function seedMember(seeded: SeededOrg) {
    const suffix = randomUUID();
    const email = `member-${suffix}@example.com`;
    const password = "correct-horse-battery-staple";
    const adminActingUser = {
      id: seeded.adminUserId,
      orgId: seeded.organizationId,
      teamId: seeded.teamId,
      role: "admin" as const,
      email: seeded.adminEmail,
    };
    const result = await withTenantContext(testDb.appDb, seeded.organizationId, (tx) =>
      createUser(tx, adminActingUser, {
        teamId: seeded.teamId,
        username: `member-${suffix}`,
        email,
        password,
        role: "member",
      }),
    );
    return { id: result.id, email, password };
  }

  async function seedApiKey(seeded: SeededOrg, actingUser: { id: string; role: "admin" | "member"; email: string }) {
    const full = {
      id: actingUser.id,
      orgId: seeded.organizationId,
      teamId: seeded.teamId,
      role: actingUser.role,
      email: actingUser.email,
    };
    const { id } = await withTenantContext(testDb.appDb, seeded.organizationId, (tx) =>
      createApiKey(tx, full, { name: "revocable-key", scopes: [actingUser.role === "admin" ? "skill:write" : "skill:read"] }),
    );
    return id;
  }

  it("revokes the caller's own key, returning 204", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const keyId = await seedApiKey(seeded, {
      id: seeded.adminUserId,
      role: "admin",
      email: seeded.adminEmail,
    });
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const DELETE = route();

    const response = await DELETE(
      new Request(`http://x/api/api-keys/${keyId}`, { method: "DELETE", headers: { cookie } }),
      { params: Promise.resolve({ keyId }) },
    );

    expect(response.status).toBe(204);
  });

  it("allows an admin to revoke another user's key in the same org", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const member = await seedMember(seeded);
    const keyId = await seedApiKey(seeded, { id: member.id, role: "member", email: member.email });
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const DELETE = route();

    const response = await DELETE(
      new Request(`http://x/api/api-keys/${keyId}`, { method: "DELETE", headers: { cookie } }),
      { params: Promise.resolve({ keyId }) },
    );

    expect(response.status).toBe(204);
  });

  it("rejects a non-admin, non-owner caller with 403 NOT_AUTHORIZED", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const memberA = await seedMember(seeded);
    const memberB = await seedMember(seeded);
    const keyId = await seedApiKey(seeded, { id: memberB.id, role: "member", email: memberB.email });
    const cookieA = await loginAndBuildCookie(testDb.authDb, memberA.email, memberA.password);
    const DELETE = route();

    const response = await DELETE(
      new Request(`http://x/api/api-keys/${keyId}`, { method: "DELETE", headers: { cookie: cookieA } }),
      { params: Promise.resolve({ keyId }) },
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_AUTHORIZED");
  });

  it("returns 404 API_KEY_NOT_FOUND for a nonexistent key id", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const DELETE = route();
    const bogusId = randomUUID();

    const response = await DELETE(
      new Request(`http://x/api/api-keys/${bogusId}`, { method: "DELETE", headers: { cookie } }),
      { params: Promise.resolve({ keyId: bogusId }) },
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("API_KEY_NOT_FOUND");
  });

  it("returns 404 API_KEY_NOT_FOUND for a key belonging to a different organization (cross-org)", async () => {
    const seededA = await seedOrgWithAdmin(testDb.authDb);
    const seededB = await seedOrgWithAdmin(testDb.authDb);
    const keyId = await seedApiKey(seededB, {
      id: seededB.adminUserId,
      role: "admin",
      email: seededB.adminEmail,
    });
    const cookieA = await loginAndBuildCookie(testDb.authDb, seededA.adminEmail, seededA.adminPassword);
    const DELETE = route();

    const response = await DELETE(
      new Request(`http://x/api/api-keys/${keyId}`, { method: "DELETE", headers: { cookie: cookieA } }),
      { params: Promise.resolve({ keyId }) },
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("API_KEY_NOT_FOUND");
  });

  it("returns 401 with no credential", async () => {
    const DELETE = route();
    const response = await DELETE(new Request("http://x/api/api-keys/anything", { method: "DELETE" }), {
      params: Promise.resolve({ keyId: "anything" }),
    });
    expect(response.status).toBe(401);
  });
});
