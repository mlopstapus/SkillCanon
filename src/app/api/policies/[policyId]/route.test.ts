import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPolicy, type PolicyScopeVerifier } from "@/bcs/governance";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withApiRoute } from "@/shared/api/handler";
import { loginAndBuildCookie, seedOrgWithAdmin, type SeededOrg } from "@/shared/api/test-helpers";
import { handleDelete, handleGet, handlePut } from "./route";

describe("/api/policies/[policyId]", () => {
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

  function permissiveVerifier(teamId: string, organizationId: string): PolicyScopeVerifier {
    return {
      teamBelongsToOrganization: async (orgId, id) => id === teamId && orgId === organizationId,
    };
  }

  async function seedPolicy(seeded: SeededOrg) {
    return withTenantContext(testDb.appDb, seeded.organizationId, (tx) =>
      createPolicy(
        tx,
        { organizationId: seeded.organizationId, userId: seeded.adminUserId },
        {
          teamId: seeded.teamId,
          name: "Require tests",
          enforcementType: "prepend",
          content: "All code must include tests.",
        },
        permissiveVerifier(seeded.teamId, seeded.organizationId),
      ),
    );
  }

  it("reads a policy", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const policy = await seedPolicy(seeded);
    const { GET } = route();

    const response = await GET(new Request(`http://x/api/policies/${policy.id}`, { headers: { cookie } }), {
      params: Promise.resolve({ policyId: policy.id }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBe(policy.id);
  });

  it("returns 404 POLICY_NOT_FOUND for a nonexistent policy id", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { GET } = route();
    const bogusId = randomUUID();

    const response = await GET(new Request(`http://x/api/policies/${bogusId}`, { headers: { cookie } }), {
      params: Promise.resolve({ policyId: bogusId }),
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("POLICY_NOT_FOUND");
  });

  it("returns 404 POLICY_NOT_FOUND for a policy belonging to a different organization (cross-org)", async () => {
    const seededA = await seedOrgWithAdmin(testDb.authDb);
    const seededB = await seedOrgWithAdmin(testDb.authDb);
    const cookieA = await loginAndBuildCookie(testDb.authDb, seededA.adminEmail, seededA.adminPassword);
    const policyB = await seedPolicy(seededB);
    const { GET } = route();

    const response = await GET(new Request(`http://x/api/policies/${policyB.id}`, { headers: { cookie: cookieA } }), {
      params: Promise.resolve({ policyId: policyB.id }),
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("POLICY_NOT_FOUND");
  });

  it("updates a policy's name", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const policy = await seedPolicy(seeded);
    const { PUT, GET } = route();

    const putResponse = await PUT(
      new Request(`http://x/api/policies/${policy.id}`, {
        method: "PUT",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ name: "Renamed policy" }),
      }),
      { params: Promise.resolve({ policyId: policy.id }) },
    );
    expect(putResponse.status).toBe(200);

    const getResponse = await GET(new Request(`http://x/api/policies/${policy.id}`, { headers: { cookie } }), {
      params: Promise.resolve({ policyId: policy.id }),
    });
    const body = await getResponse.json();
    expect(body.name).toBe("Renamed policy");
  });

  it("returns 422 VALIDATION_FAILED for an empty name on update", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const policy = await seedPolicy(seeded);
    const { PUT } = route();

    const response = await PUT(
      new Request(`http://x/api/policies/${policy.id}`, {
        method: "PUT",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ name: "" }),
      }),
      { params: Promise.resolve({ policyId: policy.id }) },
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("returns 404 POLICY_NOT_FOUND when updating a nonexistent policy", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { PUT } = route();
    const bogusId = randomUUID();

    const response = await PUT(
      new Request(`http://x/api/policies/${bogusId}`, {
        method: "PUT",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ name: "Renamed" }),
      }),
      { params: Promise.resolve({ policyId: bogusId }) },
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("POLICY_NOT_FOUND");
  });

  it("deletes (deactivates) a policy and a subsequent read shows it inactive", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const policy = await seedPolicy(seeded);
    const { DELETE, GET } = route();

    const deleteResponse = await DELETE(
      new Request(`http://x/api/policies/${policy.id}`, { method: "DELETE", headers: { cookie } }),
      { params: Promise.resolve({ policyId: policy.id }) },
    );
    expect(deleteResponse.status).toBe(204);

    // `deletePolicy` is a soft-delete (deactivate) — `getPolicy` does not
    // filter by `isActive`, so the row is still readable, just inactive.
    const getResponse = await GET(new Request(`http://x/api/policies/${policy.id}`, { headers: { cookie } }), {
      params: Promise.resolve({ policyId: policy.id }),
    });
    expect(getResponse.status).toBe(200);
    const body = await getResponse.json();
    expect(body.isActive).toBe(false);
  });

  it("returns 404 POLICY_NOT_FOUND when deleting a nonexistent policy", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { DELETE } = route();
    const bogusId = randomUUID();

    const response = await DELETE(
      new Request(`http://x/api/policies/${bogusId}`, { method: "DELETE", headers: { cookie } }),
      { params: Promise.resolve({ policyId: bogusId }) },
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("POLICY_NOT_FOUND");
  });

  it("returns 401 with no credential", async () => {
    const { GET } = route();
    const response = await GET(new Request("http://x/api/policies/anything"), {
      params: Promise.resolve({ policyId: "anything" }),
    });
    expect(response.status).toBe(401);
  });
});
