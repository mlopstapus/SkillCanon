import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPolicy, type PolicyScopeVerifier } from "@/bcs/governance";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withApiRoute } from "@/shared/api/handler";
import { loginAndBuildCookie, seedOrgWithAdmin, type SeededOrg } from "@/shared/api/test-helpers";
import { handleGet, handlePost } from "./route";

describe("/api/policies", () => {
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

  function permissiveVerifier(teamId: string, organizationId: string): PolicyScopeVerifier {
    return {
      teamBelongsToOrganization: async (orgId, id) => id === teamId && orgId === organizationId,
    };
  }

  async function seedPolicy(seeded: SeededOrg, overrides: Partial<{ name: string; priority: number }> = {}) {
    return withTenantContext(testDb.appDb, seeded.organizationId, (tx) =>
      createPolicy(
        tx,
        { organizationId: seeded.organizationId, userId: seeded.adminUserId },
        {
          teamId: seeded.teamId,
          name: overrides.name ?? "Require tests",
          enforcementType: "prepend",
          content: "All code must include tests.",
          priority: overrides.priority ?? 0,
        },
        permissiveVerifier(seeded.teamId, seeded.organizationId),
      ),
    );
  }

  it("creates a policy and returns 201 with an id", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { POST } = route();

    const response = await POST(
      new Request("http://x/api/policies", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({
          teamId: seeded.teamId,
          name: "Require tests",
          enforcementType: "prepend",
          content: "All code must include tests.",
        }),
      }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.id).toBeTypeOf("string");
    expect(body.teamId).toBe(seeded.teamId);
  });

  it("returns 422 VALIDATION_FAILED for a missing required field", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { POST } = route();

    const response = await POST(
      new Request("http://x/api/policies", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ teamId: seeded.teamId, name: "Require tests" }),
      }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("returns 404 POLICY_SCOPE_NOT_FOUND-mapping error for a team from a different org", async () => {
    const seededA = await seedOrgWithAdmin(testDb.authDb);
    const seededB = await seedOrgWithAdmin(testDb.authDb);
    const cookieA = await loginAndBuildCookie(testDb.authDb, seededA.adminEmail, seededA.adminPassword);
    const { POST } = route();

    const response = await POST(
      new Request("http://x/api/policies", {
        method: "POST",
        headers: { cookie: cookieA, "content-type": "application/json" },
        body: JSON.stringify({
          teamId: seededB.teamId,
          name: "Cross org policy",
          enforcementType: "prepend",
          content: "Should not be created.",
        }),
      }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("POLICY_SCOPE_NOT_FOUND");
  });

  it("returns 401 with no credential", async () => {
    const { GET } = route();
    const response = await GET(new Request("http://x/api/policies"), { params: Promise.resolve({}) });
    expect(response.status).toBe(401);
  });

  it("returns 422 VALIDATION_FAILED when ?teamId= is missing", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { GET } = route();

    const response = await GET(new Request("http://x/api/policies", { headers: { cookie } }), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("lists policies scoped to the given team", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const policy = await seedPolicy(seeded);
    const { GET } = route();

    const response = await GET(
      new Request(`http://x/api/policies?teamId=${seeded.teamId}`, { headers: { cookie } }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((p: { id: string }) => p.id === policy.id)).toBe(true);
  });
});
