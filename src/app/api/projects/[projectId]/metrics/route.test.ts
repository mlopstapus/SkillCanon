import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createProject } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withApiRoute } from "@/shared/api/handler";
import { loginAndBuildCookie, seedOrgWithAdmin, type SeededOrg } from "@/shared/api/test-helpers";
import { makeProjectIdentityVerifier } from "../../project-identity-verifier";
import { handleGet } from "./route";

describe("/api/projects/[projectId]/metrics", () => {
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
    return withApiRoute(handleGet, { authDb: testDb.authDb, db: testDb.appDb });
  }

  async function seedProject(seeded: SeededOrg) {
    const actor = { organizationId: seeded.organizationId, userId: seeded.adminUserId };
    const suffix = randomUUID();
    return withTenantContext(testDb.appDb, seeded.organizationId, (tx) =>
      createProject(
        tx,
        actor,
        { organizationId: seeded.organizationId, teamId: seeded.teamId, name: "Atlas", slug: `atlas-${suffix}` },
        makeProjectIdentityVerifier(tx),
      ),
    );
  }

  it("returns zeroed metrics for a project with no usage", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const project = await seedProject(seeded);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const GET = route();

    const response = await GET(new Request(`http://x/api/projects/${project.id}/metrics`, { headers: { cookie } }), {
      params: Promise.resolve({ projectId: project.id }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.totalInvocations).toBe(0);
    expect(body.activeSkillCount).toBe(0);
  });

  it("returns 404 PROJECT_NOT_FOUND for a nonexistent project", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const GET = route();
    const bogusProjectId = randomUUID();

    const response = await GET(new Request(`http://x/api/projects/${bogusProjectId}/metrics`, { headers: { cookie } }), {
      params: Promise.resolve({ projectId: bogusProjectId }),
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("PROJECT_NOT_FOUND");
  });

  it("returns 404 PROJECT_NOT_FOUND for a cross-org project id", async () => {
    const seededA = await seedOrgWithAdmin(testDb.authDb);
    const seededB = await seedOrgWithAdmin(testDb.authDb);
    const projectB = await seedProject(seededB);
    const cookieA = await loginAndBuildCookie(testDb.authDb, seededA.adminEmail, seededA.adminPassword);
    const GET = route();

    const response = await GET(
      new Request(`http://x/api/projects/${projectB.id}/metrics`, { headers: { cookie: cookieA } }),
      { params: Promise.resolve({ projectId: projectB.id }) },
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("PROJECT_NOT_FOUND");
  });

  it("returns 401 with no credential", async () => {
    const GET = route();
    const response = await GET(new Request("http://x/api/projects/anything/metrics"), {
      params: Promise.resolve({ projectId: "anything" }),
    });
    expect(response.status).toBe(401);
  });
});
