import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createUser } from "@/bcs/identity-access";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withApiRoute } from "@/shared/api/handler";
import { loginAndBuildCookie, seedOrgWithAdmin, type SeededOrg } from "@/shared/api/test-helpers";
import { handleDelete, handleGet, handlePut } from "./route";

describe("/api/users/[userId]", () => {
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
      GET: withApiRoute(handleGet, deps),
      PUT: withApiRoute(handlePut, deps),
      DELETE: withApiRoute(handleDelete, deps),
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

  it("reads the caller's own user record", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { GET } = route();

    const response = await GET(new Request(`http://x/api/users/${seeded.adminUserId}`, { headers: { cookie } }), {
      params: Promise.resolve({ userId: seeded.adminUserId }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBe(seeded.adminUserId);
  });

  it("returns 404 USER_NOT_FOUND for a nonexistent user id", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { GET } = route();
    const bogusId = randomUUID();

    const response = await GET(new Request(`http://x/api/users/${bogusId}`, { headers: { cookie } }), {
      params: Promise.resolve({ userId: bogusId }),
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("USER_NOT_FOUND");
  });

  it("returns 404 USER_NOT_FOUND for a user belonging to a different organization (cross-org)", async () => {
    const seededA = await seedOrgWithAdmin(testDb.authDb);
    const seededB = await seedOrgWithAdmin(testDb.authDb);
    const cookieA = await loginAndBuildCookie(testDb.authDb, seededA.adminEmail, seededA.adminPassword);
    const { GET } = route();

    const response = await GET(
      new Request(`http://x/api/users/${seededB.adminUserId}`, { headers: { cookie: cookieA } }),
      { params: Promise.resolve({ userId: seededB.adminUserId }) },
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("USER_NOT_FOUND");
  });

  it("returns 401 with no credential", async () => {
    const { GET } = route();
    const response = await GET(new Request("http://x/api/users/anything"), {
      params: Promise.resolve({ userId: "anything" }),
    });
    expect(response.status).toBe(401);
  });

  it("updates a user's displayName as an admin", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const member = await seedMember(seeded);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { PUT } = route();

    const response = await PUT(
      new Request(`http://x/api/users/${member.id}`, {
        method: "PUT",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ displayName: "Renamed Member" }),
      }),
      { params: Promise.resolve({ userId: member.id }) },
    );

    expect(response.status).toBe(200);
  });

  it("returns 422 VALIDATION_FAILED for a malformed email on update", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { PUT } = route();

    const response = await PUT(
      new Request(`http://x/api/users/${seeded.adminUserId}`, {
        method: "PUT",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ email: "not-an-email" }),
      }),
      { params: Promise.resolve({ userId: seeded.adminUserId }) },
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("rejects a non-admin member updating another member's role with 403 NOT_AUTHORIZED", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const memberA = await seedMember(seeded);
    const memberB = await seedMember(seeded);
    const cookieA = await loginAndBuildCookie(testDb.authDb, memberA.email, memberA.password);
    const { PUT } = route();

    const response = await PUT(
      new Request(`http://x/api/users/${memberB.id}`, {
        method: "PUT",
        headers: { cookie: cookieA, "content-type": "application/json" },
        body: JSON.stringify({ role: "admin" }),
      }),
      { params: Promise.resolve({ userId: memberB.id }) },
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_AUTHORIZED");
  });

  it("deactivates a user as an admin, returning 204", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const member = await seedMember(seeded);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { DELETE } = route();

    const response = await DELETE(
      new Request(`http://x/api/users/${member.id}`, { method: "DELETE", headers: { cookie } }),
      { params: Promise.resolve({ userId: member.id }) },
    );

    expect(response.status).toBe(204);
  });

  it("rejects deactivation by a non-admin caller with 403 NOT_AUTHORIZED", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const member = await seedMember(seeded);
    const cookie = await loginAndBuildCookie(testDb.authDb, member.email, member.password);
    const { DELETE } = route();

    const response = await DELETE(
      new Request(`http://x/api/users/${seeded.adminUserId}`, { method: "DELETE", headers: { cookie } }),
      { params: Promise.resolve({ userId: seeded.adminUserId }) },
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_AUTHORIZED");
  });
});
