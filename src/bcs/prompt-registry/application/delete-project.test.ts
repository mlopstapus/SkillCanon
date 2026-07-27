import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { ProjectNotFoundError } from "../domain/project";
import { addProjectMember } from "./add-project-member";
import { deleteProject } from "./delete-project";
import { getProject } from "./get-project";
import { listProjectMembers } from "./list-project-members";
import {
  createTestProject,
  makeProjectFixtureOrg,
  queryProjectAuditEvents,
  verifierFor,
} from "./project-test-helpers";

describe("deleteProject", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("deletes a project, cascades members, and records one audit event", async () => {
    const fixture = await makeProjectFixtureOrg(testDb);
    const project = await createTestProject(testDb, fixture);
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      addProjectMember(tx, fixture.actor, { projectId: project.id, userId: fixture.otherUserId }, verifierFor(fixture)),
    );

    await withTenantContext(testDb.appDb, fixture.organizationId, async (tx) => {
      await expect(deleteProject(tx, fixture.actor, project.id)).resolves.toBe(true);
      await expect(getProject(tx, fixture.organizationId, project.id)).resolves.toBeUndefined();
      await expect(listProjectMembers(tx, fixture.organizationId, project.id)).resolves.toEqual([]);
    });

    const events = await queryProjectAuditEvents(
      testDb,
      sql`action = 'project.deleted' and resource_id = ${project.id}`,
    );
    expect(events).toHaveLength(1);
  });

  it("treats cross-organization project ids as not found and writes no audit event", async () => {
    const orgA = await makeProjectFixtureOrg(testDb);
    const orgB = await makeProjectFixtureOrg(testDb);
    const projectB = await createTestProject(testDb, orgB);
    const eventsBefore = await queryProjectAuditEvents(testDb, sql`action = 'project.deleted'`);

    await expect(
      withTenantContext(testDb.appDb, orgA.organizationId, (tx) =>
        deleteProject(tx, orgA.actor, projectB.id),
      ),
    ).rejects.toThrow(ProjectNotFoundError);

    const eventsAfter = await queryProjectAuditEvents(testDb, sql`action = 'project.deleted'`);
    expect(eventsAfter).toHaveLength(eventsBefore.length);
  });
});
