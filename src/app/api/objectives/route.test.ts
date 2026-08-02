import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createObjective, type ObjectiveScopeVerifier } from "@/bcs/governance";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withApiRoute } from "@/shared/api/handler";
import { loginAndBuildCookie, seedOrgWithAdmin, type SeededOrg } from "@/shared/api/test-helpers";
import { handleGet, handlePost } from "./route";

describe("/api/objectives", () => {
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

  /** Bypasses real scope lookups — only for seeding fixtures directly via the barrel, not the real HTTP route. */
  function permissiveVerifier(organizationId: string): ObjectiveScopeVerifier {
    return {
      teamBelongsToOrganization: async (orgId) => orgId === organizationId,
      projectBelongsToOrganization: async (orgId) => orgId === organizationId,
      userBelongsToOrganization: async (orgId) => orgId === organizationId,
    };
  }

  async function seedObjective(
    seeded: SeededOrg,
    overrides: Partial<{ teamId: string | null; projectId: string | null; userId: string | null; title: string }> = {},
  ) {
    return withTenantContext(testDb.appDb, seeded.organizationId, (tx) =>
      createObjective(
        tx,
        { organizationId: seeded.organizationId, userId: seeded.adminUserId },
        { title: "Ship features", ...overrides },
        permissiveVerifier(seeded.organizationId),
      ),
    );
  }

  it("creates an objective scoped to a team and returns 201 with an id", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { POST } = route();

    const response = await POST(
      new Request("http://x/api/objectives", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ teamId: seeded.teamId, title: "Ship features" }),
      }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.id).toBeTypeOf("string");
    expect(body.teamId).toBe(seeded.teamId);
  });

  it("returns 422 VALIDATION_FAILED for a missing title", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { POST } = route();

    const response = await POST(
      new Request("http://x/api/objectives", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ teamId: seeded.teamId }),
      }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("returns 404 OBJECTIVE_SCOPE_NOT_FOUND for a team from a different org", async () => {
    const seededA = await seedOrgWithAdmin(testDb.authDb);
    const seededB = await seedOrgWithAdmin(testDb.authDb);
    const cookieA = await loginAndBuildCookie(testDb.authDb, seededA.adminEmail, seededA.adminPassword);
    const { POST } = route();

    const response = await POST(
      new Request("http://x/api/objectives", {
        method: "POST",
        headers: { cookie: cookieA, "content-type": "application/json" },
        body: JSON.stringify({ teamId: seededB.teamId, title: "Cross org objective" }),
      }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("OBJECTIVE_SCOPE_NOT_FOUND");
  });

  it("returns 401 with no credential", async () => {
    const { GET } = route();
    const response = await GET(new Request("http://x/api/objectives?teamId=x"), { params: Promise.resolve({}) });
    expect(response.status).toBe(401);
  });

  it("returns 422 VALIDATION_FAILED when no scoping query param is given", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { GET } = route();

    const response = await GET(new Request("http://x/api/objectives", { headers: { cookie } }), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("returns 422 VALIDATION_FAILED when more than one scoping query param is given", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { GET } = route();

    const response = await GET(
      new Request(`http://x/api/objectives?teamId=${seeded.teamId}&userId=${seeded.adminUserId}`, {
        headers: { cookie },
      }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("lists objectives scoped to a team via ?teamId=", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const objective = await seedObjective(seeded, { teamId: seeded.teamId });
    const { GET } = route();

    const response = await GET(new Request(`http://x/api/objectives?teamId=${seeded.teamId}`, { headers: { cookie } }), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.some((o: { id: string }) => o.id === objective.id)).toBe(true);
  });

  it("lists objectives scoped to a user via ?userId=", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const objective = await seedObjective(seeded, { teamId: null, userId: seeded.adminUserId });
    const { GET } = route();

    const response = await GET(
      new Request(`http://x/api/objectives?userId=${seeded.adminUserId}`, { headers: { cookie } }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.some((o: { id: string }) => o.id === objective.id)).toBe(true);
  });

  it("lists objectives scoped to a project via ?projectId=", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const projectId = randomUUID();
    const objective = await seedObjective(seeded, { teamId: null, projectId });
    const { GET } = route();

    const response = await GET(new Request(`http://x/api/objectives?projectId=${projectId}`, { headers: { cookie } }), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.some((o: { id: string }) => o.id === objective.id)).toBe(true);
  });
});
