import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { ProjectMemberNotFoundError } from "../domain/project";
import { addProjectMember } from "./add-project-member";
import { listProjectMembers } from "./list-project-members";
import { removeProjectMember } from "./remove-project-member";
import { createTestProject, makeProjectFixtureOrg, queryProjectAuditEvents, verifierFor } from "./project-test-helpers";

describe("removeProjectMember", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("removes a project member and records one audit event", async () => {
    const fixture = await makeProjectFixtureOrg(testDb);
    const project = await createTestProject(testDb, fixture);
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      addProjectMember(tx, fixture.actor, { projectId: project.id, userId: fixture.otherUserId }, verifierFor(fixture)),
    );

    await withTenantContext(testDb.appDb, fixture.organizationId, async (tx) => {
      await expect(removeProjectMember(tx, fixture.actor, project.id, fixture.otherUserId)).resolves.toBe(true);
      await expect(listProjectMembers(tx, fixture.organizationId, project.id)).resolves.toEqual([]);
    });

    const events = await queryProjectAuditEvents(
      testDb,
      sql`action = 'project_member.deleted' and resource_id is not null`,
    );
    expect(events).toHaveLength(1);
  });

  it("rejects removing a missing member without auditing", async () => {
    const fixture = await makeProjectFixtureOrg(testDb);
    const project = await createTestProject(testDb, fixture);
    const eventsBefore = await queryProjectAuditEvents(testDb, sql`action = 'project_member.deleted'`);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        removeProjectMember(tx, fixture.actor, project.id, fixture.otherUserId),
      ),
    ).rejects.toThrow(ProjectMemberNotFoundError);

    const eventsAfter = await queryProjectAuditEvents(testDb, sql`action = 'project_member.deleted'`);
    expect(eventsAfter).toHaveLength(eventsBefore.length);
  });
});
