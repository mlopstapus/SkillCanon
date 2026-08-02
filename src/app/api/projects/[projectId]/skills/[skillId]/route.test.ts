import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { assignSkillToProject, createPrompt, createProject, forkSkill } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withApiRoute } from "@/shared/api/handler";
import { loginAndBuildCookie, seedOrgWithAdmin, type SeededOrg } from "@/shared/api/test-helpers";
import { makeProjectIdentityVerifier } from "../../../project-identity-verifier";
import { handleDelete } from "./route";

describe("/api/projects/[projectId]/skills/[skillId]", () => {
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
    return withApiRoute(handleDelete, { authDb: testDb.authDb, db: testDb.appDb });
  }

  async function seedProjectWithAssignedSkill(seeded: SeededOrg) {
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
      await assignSkillToProject(tx, adminActingUser, project.id, teamSkill.id, { requirement: "required" });
      return { project, teamSkill };
    });
  }

  it("unassigns a skill and returns 204", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const { project, teamSkill } = await seedProjectWithAssignedSkill(seeded);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const DELETE = route();

    const response = await DELETE(
      new Request(`http://x/api/projects/${project.id}/skills/${teamSkill.id}`, { method: "DELETE", headers: { cookie } }),
      { params: Promise.resolve({ projectId: project.id, skillId: teamSkill.id }) },
    );

    expect(response.status).toBe(204);
  });

  it("returns 404 for a skill that isn't assigned to the project", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const { project } = await seedProjectWithAssignedSkill(seeded);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const DELETE = route();
    const bogusSkillId = randomUUID();

    const response = await DELETE(
      new Request(`http://x/api/projects/${project.id}/skills/${bogusSkillId}`, { method: "DELETE", headers: { cookie } }),
      { params: Promise.resolve({ projectId: project.id, skillId: bogusSkillId }) },
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("PROJECT_SKILL_ASSIGNMENT_NOT_FOUND");
  });

  it("returns 404 PROJECT_NOT_FOUND for a nonexistent project", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const DELETE = route();
    const bogusProjectId = randomUUID();
    const bogusSkillId = randomUUID();

    const response = await DELETE(
      new Request(`http://x/api/projects/${bogusProjectId}/skills/${bogusSkillId}`, { method: "DELETE", headers: { cookie } }),
      { params: Promise.resolve({ projectId: bogusProjectId, skillId: bogusSkillId }) },
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("PROJECT_NOT_FOUND");
  });

  it("returns 401 with no credential", async () => {
    const DELETE = route();
    const response = await DELETE(new Request("http://x/api/projects/x/skills/y", { method: "DELETE" }), {
      params: Promise.resolve({ projectId: "x", skillId: "y" }),
    });
    expect(response.status).toBe(401);
  });
});
