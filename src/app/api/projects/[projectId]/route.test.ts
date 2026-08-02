import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createProject } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withApiRoute } from "@/shared/api/handler";
import { loginAndBuildCookie, seedOrgWithAdmin, type SeededOrg } from "@/shared/api/test-helpers";
import { makeProjectIdentityVerifier } from "../project-identity-verifier";
import { handleDelete, handleGet, handlePut } from "./route";

describe("/api/projects/[projectId]", () => {
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

  async function seedProject(seeded: SeededOrg, name = "Atlas") {
    const actor = { organizationId: seeded.organizationId, userId: seeded.adminUserId };
    return withTenantContext(testDb.appDb, seeded.organizationId, (tx) =>
      createProject(
        tx,
        actor,
        { organizationId: seeded.organizationId, teamId: seeded.teamId, name, slug: `${name.toLowerCase()}-${randomUUID()}` },
        makeProjectIdentityVerifier(tx),
      ),
    );
  }

  it("reads an existing project", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const project = await seedProject(seeded);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { GET } = route();

    const response = await GET(new Request(`http://x/api/projects/${project.id}`, { headers: { cookie } }), {
      params: Promise.resolve({ projectId: project.id }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBe(project.id);
  });

  it("returns 404 PROJECT_NOT_FOUND for a nonexistent project id", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { GET } = route();
    const bogusId = randomUUID();

    const response = await GET(new Request(`http://x/api/projects/${bogusId}`, { headers: { cookie } }), {
      params: Promise.resolve({ projectId: bogusId }),
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("PROJECT_NOT_FOUND");
  });

  it("returns 404 PROJECT_NOT_FOUND for a project belonging to a different organization (cross-org)", async () => {
    const seededA = await seedOrgWithAdmin(testDb.authDb);
    const seededB = await seedOrgWithAdmin(testDb.authDb);
    const projectB = await seedProject(seededB);
    const cookieA = await loginAndBuildCookie(testDb.authDb, seededA.adminEmail, seededA.adminPassword);
    const { GET } = route();

    const response = await GET(
      new Request(`http://x/api/projects/${projectB.id}`, { headers: { cookie: cookieA } }),
      { params: Promise.resolve({ projectId: projectB.id }) },
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("PROJECT_NOT_FOUND");
  });

  it("updates a project's name", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const project = await seedProject(seeded);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { PUT, GET } = route();

    const putResponse = await PUT(
      new Request(`http://x/api/projects/${project.id}`, {
        method: "PUT",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ name: "Renamed Atlas" }),
      }),
      { params: Promise.resolve({ projectId: project.id }) },
    );
    expect(putResponse.status).toBe(200);

    const getResponse = await GET(new Request(`http://x/api/projects/${project.id}`, { headers: { cookie } }), {
      params: Promise.resolve({ projectId: project.id }),
    });
    const body = await getResponse.json();
    expect(body.name).toBe("Renamed Atlas");
  });

  it("returns 422 VALIDATION_FAILED for an empty name on update", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const project = await seedProject(seeded);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { PUT } = route();

    const response = await PUT(
      new Request(`http://x/api/projects/${project.id}`, {
        method: "PUT",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ name: "" }),
      }),
      { params: Promise.resolve({ projectId: project.id }) },
    );

    expect(response.status).toBe(422);
  });

  it("deletes a project", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const project = await seedProject(seeded);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { DELETE, GET } = route();

    const deleteResponse = await DELETE(
      new Request(`http://x/api/projects/${project.id}`, { method: "DELETE", headers: { cookie } }),
      { params: Promise.resolve({ projectId: project.id }) },
    );
    expect(deleteResponse.status).toBe(204);

    const getResponse = await GET(new Request(`http://x/api/projects/${project.id}`, { headers: { cookie } }), {
      params: Promise.resolve({ projectId: project.id }),
    });
    expect(getResponse.status).toBe(404);
  });

  it("returns 401 with no credential", async () => {
    const { GET } = route();
    const response = await GET(new Request("http://x/api/projects/anything"), {
      params: Promise.resolve({ projectId: "anything" }),
    });
    expect(response.status).toBe(401);
  });
});
