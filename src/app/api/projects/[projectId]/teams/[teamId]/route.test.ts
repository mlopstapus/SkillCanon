import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { addCollaboratorTeam, createProject } from "@/bcs/prompt-registry";
import { createTeam } from "@/bcs/identity-access";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withApiRoute } from "@/shared/api/handler";
import { loginAndBuildCookie, seedOrgWithAdmin, type SeededOrg } from "@/shared/api/test-helpers";
import { makeProjectIdentityVerifier } from "../../../project-identity-verifier";
import { handleDelete } from "./route";

describe("/api/projects/[projectId]/teams/[teamId]", () => {
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

  async function seedProjectWithCollaboratorTeam(seeded: SeededOrg) {
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
      const collaboratorTeam = await createTeam(
        tx,
        { organizationId: seeded.organizationId, name: "Collaborators", slug: `collab-${suffix}` },
        { actingUser: adminActingUser },
      );
      await addCollaboratorTeam(tx, adminActingUser, project.id, { teamId: collaboratorTeam.id });
      return { project, collaboratorTeam };
    });
  }

  it("removes a collaborator team and returns 204", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const { project, collaboratorTeam } = await seedProjectWithCollaboratorTeam(seeded);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const DELETE = route();

    const response = await DELETE(
      new Request(`http://x/api/projects/${project.id}/teams/${collaboratorTeam.id}`, {
        method: "DELETE",
        headers: { cookie },
      }),
      { params: Promise.resolve({ projectId: project.id, teamId: collaboratorTeam.id }) },
    );

    expect(response.status).toBe(204);
  });

  it("returns 404 for a team that isn't currently a collaborator", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const { project } = await seedProjectWithCollaboratorTeam(seeded);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const DELETE = route();
    const bogusTeamId = randomUUID();

    const response = await DELETE(
      new Request(`http://x/api/projects/${project.id}/teams/${bogusTeamId}`, { method: "DELETE", headers: { cookie } }),
      { params: Promise.resolve({ projectId: project.id, teamId: bogusTeamId }) },
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("COLLABORATOR_TEAM_NOT_FOUND");
  });

  it("returns 404 PROJECT_NOT_FOUND for a nonexistent project", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const DELETE = route();
    const bogusProjectId = randomUUID();
    const bogusTeamId = randomUUID();

    const response = await DELETE(
      new Request(`http://x/api/projects/${bogusProjectId}/teams/${bogusTeamId}`, { method: "DELETE", headers: { cookie } }),
      { params: Promise.resolve({ projectId: bogusProjectId, teamId: bogusTeamId }) },
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("PROJECT_NOT_FOUND");
  });

  it("returns 401 with no credential", async () => {
    const DELETE = route();
    const response = await DELETE(new Request("http://x/api/projects/x/teams/y", { method: "DELETE" }), {
      params: Promise.resolve({ projectId: "x", teamId: "y" }),
    });
    expect(response.status).toBe(401);
  });
});
