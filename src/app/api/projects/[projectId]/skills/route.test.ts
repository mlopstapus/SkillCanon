import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPrompt, createProject, forkSkill } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withApiRoute } from "@/shared/api/handler";
import { loginAndBuildCookie, seedOrgWithAdmin, type SeededOrg } from "@/shared/api/test-helpers";
import { makeProjectIdentityVerifier } from "../../project-identity-verifier";
import { handleGet, handlePost } from "./route";

describe("/api/projects/[projectId]/skills", () => {
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

  async function seedProjectWithTeamOwnedSkill(seeded: SeededOrg) {
    const actor = { organizationId: seeded.organizationId, userId: seeded.adminUserId };
    const adminActingUser = {
      id: seeded.adminUserId,
      orgId: seeded.organizationId,
      teamId: seeded.teamId,
      role: "admin" as const,
      email: seeded.adminEmail,
    };
    const suffix = randomUUID();
    return withTenantContext(testDb.appDb, seeded.organizationId, async (tx) => {
      const project = await createProject(
        tx,
        actor,
        { organizationId: seeded.organizationId, teamId: seeded.teamId, name: "Atlas", slug: `atlas-${suffix}` },
        makeProjectIdentityVerifier(tx),
      );
      const userSkill = await createPrompt(tx, actor, {
        organizationId: seeded.organizationId,
        name: `skill-${suffix}`,
      });
      const teamSkill = await forkSkill(tx, adminActingUser, userSkill.id, {
        ownerType: "team",
        ownerId: seeded.teamId,
      });
      return { project, teamSkill };
    });
  }

  it("assigns a skill to a project and returns 201", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const { project, teamSkill } = await seedProjectWithTeamOwnedSkill(seeded);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { POST } = route();

    const response = await POST(
      new Request(`http://x/api/projects/${project.id}/skills`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ skillId: teamSkill.id, requirement: "required" }),
      }),
      { params: Promise.resolve({ projectId: project.id }) },
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.skillId).toBe(teamSkill.id);
    expect(body.requirement).toBe("required");
  });

  it("returns 404 PROJECT_NOT_FOUND for a nonexistent project", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const { teamSkill } = await seedProjectWithTeamOwnedSkill(seeded);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { POST } = route();
    const bogusProjectId = randomUUID();

    const response = await POST(
      new Request(`http://x/api/projects/${bogusProjectId}/skills`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ skillId: teamSkill.id, requirement: "required" }),
      }),
      { params: Promise.resolve({ projectId: bogusProjectId }) },
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("PROJECT_NOT_FOUND");
  });

  it("returns 422 VALIDATION_FAILED for an invalid requirement value", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const { project, teamSkill } = await seedProjectWithTeamOwnedSkill(seeded);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { POST } = route();

    const response = await POST(
      new Request(`http://x/api/projects/${project.id}/skills`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ skillId: teamSkill.id, requirement: "nonsense" }),
      }),
      { params: Promise.resolve({ projectId: project.id }) },
    );

    expect(response.status).toBe(422);
  });

  it("rejects assigning a personally-owned skill with 422 PERSONAL_SKILL_NOT_ASSIGNABLE", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const actor = { organizationId: seeded.organizationId, userId: seeded.adminUserId };
    const suffix = randomUUID();
    const { project, personalSkillId } = await withTenantContext(testDb.appDb, seeded.organizationId, async (tx) => {
      const project = await createProject(
        tx,
        actor,
        { organizationId: seeded.organizationId, teamId: seeded.teamId, name: "Atlas", slug: `atlas-${suffix}` },
        makeProjectIdentityVerifier(tx),
      );
      const personalSkill = await createPrompt(tx, actor, {
        organizationId: seeded.organizationId,
        name: `personal-skill-${suffix}`,
      });
      return { project, personalSkillId: personalSkill.id };
    });
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { POST } = route();

    const response = await POST(
      new Request(`http://x/api/projects/${project.id}/skills`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ skillId: personalSkillId, requirement: "required" }),
      }),
      { params: Promise.resolve({ projectId: project.id }) },
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("PERSONAL_SKILL_NOT_ASSIGNABLE");
  });

  it("lists skill assignments for a project", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const { project, teamSkill } = await seedProjectWithTeamOwnedSkill(seeded);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { POST, GET } = route();

    await POST(
      new Request(`http://x/api/projects/${project.id}/skills`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ skillId: teamSkill.id, requirement: "required" }),
      }),
      { params: Promise.resolve({ projectId: project.id }) },
    );

    const response = await GET(
      new Request(`http://x/api/projects/${project.id}/skills`, { headers: { cookie } }),
      { params: Promise.resolve({ projectId: project.id }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0].skillId).toBe(teamSkill.id);
  });

  it("returns 404 PROJECT_NOT_FOUND when listing for a cross-org project id", async () => {
    const seededA = await seedOrgWithAdmin(testDb.authDb);
    const seededB = await seedOrgWithAdmin(testDb.authDb);
    const { project: projectB } = await seedProjectWithTeamOwnedSkill(seededB);
    const cookieA = await loginAndBuildCookie(testDb.authDb, seededA.adminEmail, seededA.adminPassword);
    const { GET } = route();

    const response = await GET(
      new Request(`http://x/api/projects/${projectB.id}/skills`, { headers: { cookie: cookieA } }),
      { params: Promise.resolve({ projectId: projectB.id }) },
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("PROJECT_NOT_FOUND");
  });

  it("returns 401 with no credential", async () => {
    const { GET } = route();
    const response = await GET(new Request("http://x/api/projects/anything/skills"), {
      params: Promise.resolve({ projectId: "anything" }),
    });
    expect(response.status).toBe(401);
  });
});
