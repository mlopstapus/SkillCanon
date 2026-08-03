import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withApiRoute } from "@/shared/api/handler";
import { loginAndBuildCookie, seedOrgWithAdmin } from "@/shared/api/test-helpers";
import { handleGet, handlePut } from "./route";

describe("/api/teams/[teamId]", () => {
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
    };
  }

  it("reads the caller's own root team", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { GET } = route();

    const response = await GET(new Request(`http://x/api/teams/${seeded.teamId}`, { headers: { cookie } }), {
      params: Promise.resolve({ teamId: seeded.teamId }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBe(seeded.teamId);
  });

  it("returns 404 TEAM_NOT_FOUND for a nonexistent team id", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { GET } = route();
    const bogusId = randomUUID();

    const response = await GET(new Request(`http://x/api/teams/${bogusId}`, { headers: { cookie } }), {
      params: Promise.resolve({ teamId: bogusId }),
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("TEAM_NOT_FOUND");
  });

  it("returns 404 TEAM_NOT_FOUND for a team belonging to a different organization (cross-org)", async () => {
    const seededA = await seedOrgWithAdmin(testDb.authDb);
    const seededB = await seedOrgWithAdmin(testDb.authDb);
    const cookieA = await loginAndBuildCookie(testDb.authDb, seededA.adminEmail, seededA.adminPassword);
    const { GET } = route();

    const response = await GET(new Request(`http://x/api/teams/${seededB.teamId}`, { headers: { cookie: cookieA } }), {
      params: Promise.resolve({ teamId: seededB.teamId }),
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("TEAM_NOT_FOUND");
  });

  it("updates a team's name as an admin", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { PUT, GET } = route();

    const putResponse = await PUT(
      new Request(`http://x/api/teams/${seeded.teamId}`, {
        method: "PUT",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ name: "Renamed Root" }),
      }),
      { params: Promise.resolve({ teamId: seeded.teamId }) },
    );
    expect(putResponse.status).toBe(200);

    const getResponse = await GET(new Request(`http://x/api/teams/${seeded.teamId}`, { headers: { cookie } }), {
      params: Promise.resolve({ teamId: seeded.teamId }),
    });
    const body = await getResponse.json();
    expect(body.name).toBe("Renamed Root");
  });

  it("returns 422 VALIDATION_FAILED for an empty name on update", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { PUT } = route();

    const response = await PUT(
      new Request(`http://x/api/teams/${seeded.teamId}`, {
        method: "PUT",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ name: "" }),
      }),
      { params: Promise.resolve({ teamId: seeded.teamId }) },
    );

    expect(response.status).toBe(422);
  });

  it("returns 401 with no credential", async () => {
    const { GET } = route();
    const response = await GET(new Request("http://x/api/teams/anything"), {
      params: Promise.resolve({ teamId: "anything" }),
    });
    expect(response.status).toBe(401);
  });
});
