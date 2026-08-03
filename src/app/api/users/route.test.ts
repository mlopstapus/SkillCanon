import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createUser } from "@/bcs/identity-access";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withApiRoute } from "@/shared/api/handler";
import { loginAndBuildCookie, seedOrgWithAdmin, type SeededOrg } from "@/shared/api/test-helpers";
import { handleGet, handlePost } from "./route";

describe("/api/users", () => {
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

  async function seedMember(seeded: SeededOrg, teamId = seeded.teamId) {
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
        teamId,
        username: `member-${suffix}`,
        email,
        password,
        role: "member",
      }),
    );
    return { id: result.id, email, password };
  }

  it("creates a user as an admin and returns 201 with an id", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { POST } = route();
    const suffix = randomUUID();

    const response = await POST(
      new Request("http://x/api/users", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({
          teamId: seeded.teamId,
          username: `newuser-${suffix}`,
          email: `newuser-${suffix}@example.com`,
          password: "correct-horse-battery-staple",
        }),
      }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.id).toBeTypeOf("string");
  });

  it("rejects user creation by a non-admin caller with 403 NOT_AUTHORIZED", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const member = await seedMember(seeded);
    const cookie = await loginAndBuildCookie(testDb.authDb, member.email, member.password);
    const { POST } = route();
    const suffix = randomUUID();

    const response = await POST(
      new Request("http://x/api/users", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({
          teamId: seeded.teamId,
          username: `newuser-${suffix}`,
          email: `newuser-${suffix}@example.com`,
          password: "correct-horse-battery-staple",
        }),
      }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_AUTHORIZED");
  });

  it("returns 401 with no credential", async () => {
    const { GET } = route();
    const response = await GET(new Request("http://x/api/users"), { params: Promise.resolve({}) });
    expect(response.status).toBe(401);
  });

  it("returns 422 VALIDATION_FAILED for a missing required field", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { POST } = route();

    const response = await POST(
      new Request("http://x/api/users", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ teamId: seeded.teamId, username: "onlyusername" }),
      }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("lists users scoped to the caller's organization only, paginated", async () => {
    const seededA = await seedOrgWithAdmin(testDb.authDb);
    const seededB = await seedOrgWithAdmin(testDb.authDb);
    await seedMember(seededA);
    const cookieA = await loginAndBuildCookie(testDb.authDb, seededA.adminEmail, seededA.adminPassword);
    const { GET } = route();

    const response = await GET(new Request("http://x/api/users", { headers: { cookie: cookieA } }), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    // seeded admin + the one member created above
    expect(body.items).toHaveLength(2);
    expect(body.items.some((u: { id: string }) => u.id === seededB.adminUserId)).toBe(false);
  });

  it("filters listed users by teamId query param", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { GET } = route();

    const response = await GET(
      new Request(`http://x/api/users?teamId=${randomUUID()}`, { headers: { cookie } }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items).toHaveLength(0);
  });
});
