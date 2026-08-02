import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withApiRoute } from "@/shared/api/handler";
import { loginAndBuildCookie, seedOrgWithAdmin } from "@/shared/api/test-helpers";
import { handleGet, handlePost } from "./route";

describe("/api/projects", () => {
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

  it("creates a project as the admin and returns 201 with an id", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { POST } = route();

    const response = await POST(
      new Request("http://x/api/projects", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({
          teamId: seeded.teamId,
          name: "Atlas",
          slug: `atlas-${randomUUID()}`,
        }),
      }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.id).toBeTypeOf("string");
  });

  it("returns 401 with no credential", async () => {
    const { GET } = route();
    const response = await GET(new Request("http://x/api/projects"), { params: Promise.resolve({}) });
    expect(response.status).toBe(401);
  });

  it("returns 422 VALIDATION_FAILED for a missing required field", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { POST } = route();

    const response = await POST(
      new Request("http://x/api/projects", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ name: "Atlas" }),
      }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("returns 404 for a project created against a team from a different organization", async () => {
    const seededA = await seedOrgWithAdmin(testDb.authDb);
    const seededB = await seedOrgWithAdmin(testDb.authDb);
    const cookieA = await loginAndBuildCookie(testDb.authDb, seededA.adminEmail, seededA.adminPassword);
    const { POST } = route();

    const response = await POST(
      new Request("http://x/api/projects", {
        method: "POST",
        headers: { cookie: cookieA, "content-type": "application/json" },
        body: JSON.stringify({
          teamId: seededB.teamId,
          name: "Cross Org",
          slug: `cross-org-${randomUUID()}`,
        }),
      }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(404);
  });

  it("lists projects scoped to the caller's organization only, paginated", async () => {
    const seededA = await seedOrgWithAdmin(testDb.authDb);
    const seededB = await seedOrgWithAdmin(testDb.authDb);
    const cookieA = await loginAndBuildCookie(testDb.authDb, seededA.adminEmail, seededA.adminPassword);
    const { POST, GET } = route();

    await POST(
      new Request("http://x/api/projects", {
        method: "POST",
        headers: { cookie: cookieA, "content-type": "application/json" },
        body: JSON.stringify({ teamId: seededA.teamId, name: "Atlas", slug: `atlas-${randomUUID()}` }),
      }),
      { params: Promise.resolve({}) },
    );

    const cookieB = await loginAndBuildCookie(testDb.authDb, seededB.adminEmail, seededB.adminPassword);
    await POST(
      new Request("http://x/api/projects", {
        method: "POST",
        headers: { cookie: cookieB, "content-type": "application/json" },
        body: JSON.stringify({ teamId: seededB.teamId, name: "Orbit", slug: `orbit-${randomUUID()}` }),
      }),
      { params: Promise.resolve({}) },
    );

    const response = await GET(new Request("http://x/api/projects", { headers: { cookie: cookieA } }), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].name).toBe("Atlas");
  });

  it("filters by ?teamId= using listProjectsByTeam", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { POST, GET } = route();

    await POST(
      new Request("http://x/api/projects", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ teamId: seeded.teamId, name: "Atlas", slug: `atlas-${randomUUID()}` }),
      }),
      { params: Promise.resolve({}) },
    );

    const response = await GET(
      new Request(`http://x/api/projects?teamId=${seeded.teamId}`, { headers: { cookie } }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].teamId).toBe(seeded.teamId);
  });
});
