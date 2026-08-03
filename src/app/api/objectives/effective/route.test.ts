import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createObjective, type ObjectiveScopeVerifier } from "@/bcs/governance";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withApiRoute } from "@/shared/api/handler";
import { loginAndBuildCookie, seedOrgWithAdmin, type SeededOrg } from "@/shared/api/test-helpers";
import { handleGet } from "./route";

describe("/api/objectives/effective", () => {
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
    return { GET: withApiRoute(handleGet, deps) };
  }

  function permissiveVerifier(organizationId: string): ObjectiveScopeVerifier {
    return {
      teamBelongsToOrganization: async (orgId) => orgId === organizationId,
      projectBelongsToOrganization: async (orgId) => orgId === organizationId,
      userBelongsToOrganization: async (orgId) => orgId === organizationId,
    };
  }

  async function seedObjective(seeded: SeededOrg) {
    return withTenantContext(testDb.appDb, seeded.organizationId, (tx) =>
      createObjective(
        tx,
        { organizationId: seeded.organizationId, userId: seeded.adminUserId },
        { teamId: seeded.teamId, title: "Ship features" },
        permissiveVerifier(seeded.organizationId),
      ),
    );
  }

  it("resolves effective objectives for the caller's own id when ?userId= is omitted", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const objective = await seedObjective(seeded);
    const { GET } = route();

    const response = await GET(new Request("http://x/api/objectives/effective", { headers: { cookie } }), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.local.some((o: { id: string }) => o.id === objective.id)).toBe(true);
  });

  it("resolves effective objectives for an explicit ?userId=", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const objective = await seedObjective(seeded);
    const { GET } = route();

    const response = await GET(
      new Request(`http://x/api/objectives/effective?userId=${seeded.adminUserId}`, { headers: { cookie } }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.local.some((o: { id: string }) => o.id === objective.id)).toBe(true);
  });

  it("returns 401 with no credential", async () => {
    const { GET } = route();
    const response = await GET(new Request("http://x/api/objectives/effective"), { params: Promise.resolve({}) });
    expect(response.status).toBe(401);
  });
});
