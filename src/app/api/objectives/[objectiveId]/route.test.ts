import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createObjective, type ObjectiveScopeVerifier } from "@/bcs/governance";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withApiRoute } from "@/shared/api/handler";
import { loginAndBuildCookie, seedOrgWithAdmin, type SeededOrg } from "@/shared/api/test-helpers";
import { handleDelete, handleGet, handlePut } from "./route";

describe("/api/objectives/[objectiveId]", () => {
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

  it("reads an objective", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const objective = await seedObjective(seeded);
    const { GET } = route();

    const response = await GET(new Request(`http://x/api/objectives/${objective.id}`, { headers: { cookie } }), {
      params: Promise.resolve({ objectiveId: objective.id }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBe(objective.id);
  });

  it("returns 404 OBJECTIVE_NOT_FOUND for a nonexistent objective id", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { GET } = route();
    const bogusId = randomUUID();

    const response = await GET(new Request(`http://x/api/objectives/${bogusId}`, { headers: { cookie } }), {
      params: Promise.resolve({ objectiveId: bogusId }),
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("OBJECTIVE_NOT_FOUND");
  });

  it("returns 404 OBJECTIVE_NOT_FOUND for an objective belonging to a different organization (cross-org)", async () => {
    const seededA = await seedOrgWithAdmin(testDb.authDb);
    const seededB = await seedOrgWithAdmin(testDb.authDb);
    const cookieA = await loginAndBuildCookie(testDb.authDb, seededA.adminEmail, seededA.adminPassword);
    const objectiveB = await seedObjective(seededB);
    const { GET } = route();

    const response = await GET(
      new Request(`http://x/api/objectives/${objectiveB.id}`, { headers: { cookie: cookieA } }),
      { params: Promise.resolve({ objectiveId: objectiveB.id }) },
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("OBJECTIVE_NOT_FOUND");
  });

  it("updates an objective's title", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const objective = await seedObjective(seeded);
    const { PUT, GET } = route();

    const putResponse = await PUT(
      new Request(`http://x/api/objectives/${objective.id}`, {
        method: "PUT",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ title: "Renamed objective" }),
      }),
      { params: Promise.resolve({ objectiveId: objective.id }) },
    );
    expect(putResponse.status).toBe(200);

    const getResponse = await GET(new Request(`http://x/api/objectives/${objective.id}`, { headers: { cookie } }), {
      params: Promise.resolve({ objectiveId: objective.id }),
    });
    const body = await getResponse.json();
    expect(body.title).toBe("Renamed objective");
  });

  it("returns 422 VALIDATION_FAILED for an empty title on update", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const objective = await seedObjective(seeded);
    const { PUT } = route();

    const response = await PUT(
      new Request(`http://x/api/objectives/${objective.id}`, {
        method: "PUT",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ title: "" }),
      }),
      { params: Promise.resolve({ objectiveId: objective.id }) },
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("returns 404 OBJECTIVE_NOT_FOUND when updating a nonexistent objective", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { PUT } = route();
    const bogusId = randomUUID();

    const response = await PUT(
      new Request(`http://x/api/objectives/${bogusId}`, {
        method: "PUT",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ title: "Renamed" }),
      }),
      { params: Promise.resolve({ objectiveId: bogusId }) },
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("OBJECTIVE_NOT_FOUND");
  });

  it("deletes an objective and a subsequent read 404s", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const objective = await seedObjective(seeded);
    const { DELETE, GET } = route();

    const deleteResponse = await DELETE(
      new Request(`http://x/api/objectives/${objective.id}`, { method: "DELETE", headers: { cookie } }),
      { params: Promise.resolve({ objectiveId: objective.id }) },
    );
    expect(deleteResponse.status).toBe(204);

    const getResponse = await GET(new Request(`http://x/api/objectives/${objective.id}`, { headers: { cookie } }), {
      params: Promise.resolve({ objectiveId: objective.id }),
    });
    expect(getResponse.status).toBe(404);
  });

  it("returns 404 OBJECTIVE_NOT_FOUND when deleting a nonexistent objective", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { DELETE } = route();
    const bogusId = randomUUID();

    const response = await DELETE(
      new Request(`http://x/api/objectives/${bogusId}`, { method: "DELETE", headers: { cookie } }),
      { params: Promise.resolve({ objectiveId: bogusId }) },
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("OBJECTIVE_NOT_FOUND");
  });

  it("returns 401 with no credential", async () => {
    const { GET } = route();
    const response = await GET(new Request("http://x/api/objectives/anything"), {
      params: Promise.resolve({ objectiveId: "anything" }),
    });
    expect(response.status).toBe(401);
  });
});
