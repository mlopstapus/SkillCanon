import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createUser } from "@/bcs/identity-access";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withApiRoute } from "@/shared/api/handler";
import {
  createApiKeyAndBuildAuthHeader,
  loginAndBuildCookie,
  seedOrgWithAdmin,
  type SeededOrg,
} from "@/shared/api/test-helpers";
import { handleGet, handlePost } from "./route";

describe("/api/users/[userId]/api-keys", () => {
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
    const deps = { authDb: testDb.authDb, db: testDb.appDb };
    return {
      POST: withApiRoute(handlePost, deps),
      GET: withApiRoute(handleGet, deps),
    };
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

  it("creates an API key for the caller's own user and returns the one-time rawKey", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { POST } = route();

    const response = await POST(
      new Request(`http://x/api/users/${seeded.adminUserId}/api-keys`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ name: "ci-key", scopes: ["skill:read"] }),
      }),
      { params: Promise.resolve({ userId: seeded.adminUserId }) },
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.id).toBeTypeOf("string");
    expect(body.rawKey).toBeTypeOf("string");
  });

  it("rejects an admin creating a key on a different user's path with 403 NOT_AUTHORIZED", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const member = await seedMember(seeded);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { POST } = route();

    const response = await POST(
      new Request(`http://x/api/users/${member.id}/api-keys`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ name: "delegated-key", scopes: ["skill:read"] }),
      }),
      { params: Promise.resolve({ userId: member.id }) },
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_AUTHORIZED");
  });

  it("returns 401 with no credential", async () => {
    const { GET } = route();
    const response = await GET(new Request("http://x/api/users/anything/api-keys"), {
      params: Promise.resolve({ userId: "anything" }),
    });
    expect(response.status).toBe(401);
  });

  it("returns 422 VALIDATION_FAILED for an empty name", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { POST } = route();

    const response = await POST(
      new Request(`http://x/api/users/${seeded.adminUserId}/api-keys`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ name: "", scopes: ["skill:read"] }),
      }),
      { params: Promise.resolve({ userId: seeded.adminUserId }) },
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("returns 404 CROSS_ORG_USER_ACCESS when an admin lists keys for a nonexistent user id", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { GET } = route();
    const bogusId = randomUUID();

    const response = await GET(
      new Request(`http://x/api/users/${bogusId}/api-keys`, { headers: { cookie } }),
      { params: Promise.resolve({ userId: bogusId }) },
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("CROSS_ORG_USER_ACCESS");
  });

  it("rejects a non-admin member listing another member's keys with 403 NOT_AUTHORIZED", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const memberA = await seedMember(seeded);
    const memberB = await seedMember(seeded);
    const cookieA = await loginAndBuildCookie(testDb.authDb, memberA.email, memberA.password);
    const { GET } = route();

    const response = await GET(
      new Request(`http://x/api/users/${memberB.id}/api-keys`, { headers: { cookie: cookieA } }),
      { params: Promise.resolve({ userId: memberB.id }) },
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_AUTHORIZED");
  });

  it("lists the caller's own API keys, never including the hash or raw value", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { POST, GET } = route();

    await POST(
      new Request(`http://x/api/users/${seeded.adminUserId}/api-keys`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ name: "listed-key", scopes: ["skill:read"] }),
      }),
      { params: Promise.resolve({ userId: seeded.adminUserId }) },
    );

    const response = await GET(
      new Request(`http://x/api/users/${seeded.adminUserId}/api-keys`, { headers: { cookie } }),
      { params: Promise.resolve({ userId: seeded.adminUserId }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.length).toBeGreaterThanOrEqual(1);
    expect(body[0].keyHash).toBeUndefined();
    expect(body[0].rawKey).toBeUndefined();
  });

  it("authenticates via an Authorization: Bearer API key header (dual-mode auth)", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const actingAdmin = {
      id: seeded.adminUserId,
      orgId: seeded.organizationId,
      teamId: seeded.teamId,
      role: "admin" as const,
      email: seeded.adminEmail,
    };
    const authHeader = await withTenantContext(testDb.appDb, seeded.organizationId, (tx) =>
      createApiKeyAndBuildAuthHeader(tx, actingAdmin),
    );
    const { GET } = route();

    const response = await GET(
      new Request(`http://x/api/users/${seeded.adminUserId}/api-keys`, {
        headers: { authorization: authHeader },
      }),
      { params: Promise.resolve({ userId: seeded.adminUserId }) },
    );

    expect(response.status).toBe(200);
  });
});
