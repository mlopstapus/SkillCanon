import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { addProjectMember } from "./add-project-member";
import { listProjectMembers } from "./list-project-members";
import { createTestProject, makeProjectFixtureOrg, verifierFor } from "./project-test-helpers";

describe("listProjectMembers", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("returns only one project's members in creation order", async () => {
    const fixture = await makeProjectFixtureOrg(testDb);
    const project = await createTestProject(testDb, fixture);
    const otherProject = await createTestProject(testDb, fixture);

    await withTenantContext(testDb.appDb, fixture.organizationId, async (tx) => {
      await addProjectMember(tx, fixture.actor, { projectId: project.id, userId: fixture.actorUserId }, verifierFor(fixture));
      await addProjectMember(tx, fixture.actor, { projectId: project.id, userId: fixture.otherUserId }, verifierFor(fixture));
      await addProjectMember(tx, fixture.actor, { projectId: otherProject.id, userId: fixture.actorUserId }, verifierFor(fixture));

      const members = await listProjectMembers(tx, fixture.organizationId, project.id);
      expect(members.map((member) => member.userId)).toEqual([
        fixture.actorUserId,
        fixture.otherUserId,
      ]);
    });
  });

  it("returns an empty list for cross-organization project ids", async () => {
    const orgA = await makeProjectFixtureOrg(testDb);
    const orgB = await makeProjectFixtureOrg(testDb);
    const projectB = await createTestProject(testDb, orgB);

    await withTenantContext(testDb.appDb, orgA.organizationId, async (tx) => {
      await expect(listProjectMembers(tx, orgA.organizationId, projectB.id)).resolves.toEqual([]);
    });
  });
});
