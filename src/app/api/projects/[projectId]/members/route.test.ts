import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createProject } from "@/bcs/prompt-registry";
import { createUser } from "@/bcs/identity-access";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withApiRoute } from "@/shared/api/handler";
import { loginAndBuildCookie, seedOrgWithAdmin, type SeededOrg } from "@/shared/api/test-helpers";
import { makeProjectIdentityVerifier } from "../../project-identity-verifier";
import { handleGet, handlePost } from "./route";

describe("/api/projects/[projectId]/members", () => {
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

  async function seedMemberUser(seeded: SeededOrg) {
    const suffix = randomUUID();
    const adminActingUser = {
      id: seeded.adminUserId,
      orgId: seeded.organizationId,
      teamId: seeded.teamId,
      role: "admin" as const,
      email: seeded.adminEmail,
    };
    const user = await withTenantContext(testDb.appDb, seeded.organizationId, (tx) =>
      createUser(tx, adminActingUser, {
        teamId: seeded.teamId,
        username: `member-${suffix}`,
        email: `member-${suffix}@example.com`,
        password: "correct-horse-battery-staple",
        role: "member",
      }),
    );
    return user;
  }

  it("adds a project member and returns 201", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const project = await seedProject(seeded);
    const member = await seedMemberUser(seeded);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { POST } = route();

    const response = await POST(
      new Request(`http://x/api/projects/${project.id}/members`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ userId: member.id }),
      }),
      { params: Promise.resolve({ projectId: project.id }) },
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.userId).toBe(member.id);
  });

  it("returns 404 PROJECT_NOT_FOUND for a nonexistent project", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const member = await seedMemberUser(seeded);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { POST } = route();
    const bogusProjectId = randomUUID();

    const response = await POST(
      new Request(`http://x/api/projects/${bogusProjectId}/members`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ userId: member.id }),
      }),
      { params: Promise.resolve({ projectId: bogusProjectId }) },
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("PROJECT_NOT_FOUND");
  });

  it("returns 422 VALIDATION_FAILED for a missing userId", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const project = await seedProject(seeded);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { POST } = route();

    const response = await POST(
      new Request(`http://x/api/projects/${project.id}/members`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ projectId: project.id }) },
    );

    expect(response.status).toBe(422);
  });

  it("lists project members", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const project = await seedProject(seeded);
    const member = await seedMemberUser(seeded);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { POST, GET } = route();

    await POST(
      new Request(`http://x/api/projects/${project.id}/members`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ userId: member.id }),
      }),
      { params: Promise.resolve({ projectId: project.id }) },
    );

    const response = await GET(
      new Request(`http://x/api/projects/${project.id}/members`, { headers: { cookie } }),
      { params: Promise.resolve({ projectId: project.id }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0].userId).toBe(member.id);
  });

  it("returns 404 PROJECT_NOT_FOUND when listing members for a cross-org project id", async () => {
    const seededA = await seedOrgWithAdmin(testDb.authDb);
    const seededB = await seedOrgWithAdmin(testDb.authDb);
    const projectB = await seedProject(seededB);
    const cookieA = await loginAndBuildCookie(testDb.authDb, seededA.adminEmail, seededA.adminPassword);
    const { GET } = route();

    const response = await GET(
      new Request(`http://x/api/projects/${projectB.id}/members`, { headers: { cookie: cookieA } }),
      { params: Promise.resolve({ projectId: projectB.id }) },
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("PROJECT_NOT_FOUND");
  });

  it("returns 401 with no credential", async () => {
    const { GET } = route();
    const response = await GET(new Request("http://x/api/projects/anything/members"), {
      params: Promise.resolve({ projectId: "anything" }),
    });
    expect(response.status).toBe(401);
  });
});
