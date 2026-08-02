import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { addProjectMember, createProject } from "@/bcs/prompt-registry";
import { createUser } from "@/bcs/identity-access";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withApiRoute } from "@/shared/api/handler";
import { loginAndBuildCookie, seedOrgWithAdmin, type SeededOrg } from "@/shared/api/test-helpers";
import { makeProjectIdentityVerifier } from "../../../project-identity-verifier";
import { handleDelete } from "./route";

describe("/api/projects/[projectId]/members/[userId]", () => {
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

  async function seedProjectWithMember(seeded: SeededOrg) {
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
      const member = await createUser(tx, adminActingUser, {
        teamId: seeded.teamId,
        username: `member-${suffix}`,
        email: `member-${suffix}@example.com`,
        password: "correct-horse-battery-staple",
        role: "member",
      });
      await addProjectMember(tx, actor, { projectId: project.id, userId: member.id }, makeProjectIdentityVerifier(tx));
      return { project, member };
    });
  }

  it("removes a project member and returns 204", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const { project, member } = await seedProjectWithMember(seeded);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const DELETE = route();

    const response = await DELETE(
      new Request(`http://x/api/projects/${project.id}/members/${member.id}`, { method: "DELETE", headers: { cookie } }),
      { params: Promise.resolve({ projectId: project.id, userId: member.id }) },
    );

    expect(response.status).toBe(204);
  });

  it("returns 404 for a membership that doesn't exist", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const { project } = await seedProjectWithMember(seeded);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const DELETE = route();
    const bogusUserId = randomUUID();

    const response = await DELETE(
      new Request(`http://x/api/projects/${project.id}/members/${bogusUserId}`, { method: "DELETE", headers: { cookie } }),
      { params: Promise.resolve({ projectId: project.id, userId: bogusUserId }) },
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("PROJECT_MEMBER_NOT_FOUND");
  });

  it("returns 404 PROJECT_NOT_FOUND for a nonexistent project", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const DELETE = route();
    const bogusProjectId = randomUUID();
    const bogusUserId = randomUUID();

    const response = await DELETE(
      new Request(`http://x/api/projects/${bogusProjectId}/members/${bogusUserId}`, { method: "DELETE", headers: { cookie } }),
      { params: Promise.resolve({ projectId: bogusProjectId, userId: bogusUserId }) },
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("PROJECT_NOT_FOUND");
  });

  it("returns 401 with no credential", async () => {
    const DELETE = route();
    const response = await DELETE(new Request("http://x/api/projects/x/members/y", { method: "DELETE" }), {
      params: Promise.resolve({ projectId: "x", userId: "y" }),
    });
    expect(response.status).toBe(401);
  });
});
