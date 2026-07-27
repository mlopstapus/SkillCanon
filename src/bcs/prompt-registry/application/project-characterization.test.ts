import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { addProjectMember } from "./add-project-member";
import { deleteProject } from "./delete-project";
import { getProject } from "./get-project";
import { listProjectMembers } from "./list-project-members";
import { listProjectsByTeam } from "./list-projects";
import { updateProject } from "./update-project";
import { createTestProject, makeProjectFixtureOrg, verifierFor } from "./project-test-helpers";

describe("legacy project-service characterization", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("matches legacy create/read/update/list/delete and member flows with org scoping added", async () => {
    const fixture = await makeProjectFixtureOrg(testDb);
    const project = await createTestProject(testDb, fixture, {
      name: "Legacy Shape",
      slug: "legacy-shape",
      leadUserId: fixture.actorUserId,
    });

    await withTenantContext(testDb.appDb, fixture.organizationId, async (tx) => {
      expect(await getProject(tx, fixture.organizationId, project.id)).toMatchObject({
        id: project.id,
        slug: "legacy-shape",
        leadUserId: fixture.actorUserId,
      });
      expect((await listProjectsByTeam(tx, fixture.organizationId, fixture.teamId)).map((row) => row.id)).toContain(project.id);

      const updated = await updateProject(
        tx,
        fixture.actor,
        project.id,
        { name: "Legacy Updated", description: "Updated" },
        verifierFor(fixture),
      );
      expect(updated).toMatchObject({ name: "Legacy Updated", description: "Updated" });

      await addProjectMember(tx, fixture.actor, { projectId: project.id, userId: fixture.otherUserId }, verifierFor(fixture));
      expect((await listProjectMembers(tx, fixture.organizationId, project.id)).map((row) => row.userId)).toEqual([
        fixture.otherUserId,
      ]);

      await expect(deleteProject(tx, fixture.actor, project.id)).resolves.toBe(true);
      await expect(getProject(tx, fixture.organizationId, project.id)).resolves.toBeUndefined();
    });
  });
});
