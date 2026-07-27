import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import {
  DuplicateProjectMemberError,
  ProjectUserNotFoundError,
} from "../domain/project";
import { addProjectMember } from "./add-project-member";
import {
  countProjectMemberRows,
  createTestProject,
  makeProjectFixtureOrg,
  queryProjectAuditEvents,
  verifierFor,
} from "./project-test-helpers";

describe("addProjectMember", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("adds a same-organization user from another team and records one audit event", async () => {
    const fixture = await makeProjectFixtureOrg(testDb);
    const project = await createTestProject(testDb, fixture);

    const member = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      addProjectMember(
        tx,
        fixture.actor,
        { projectId: project.id, userId: fixture.otherUserId, role: "contributor" },
        verifierFor(fixture),
        { transport: "cli", sourceIp: null },
      ),
    );

    expect(member.projectId).toBe(project.id);
    expect(member.userId).toBe(fixture.otherUserId);
    expect(member.role).toBe("contributor");
    const events = await queryProjectAuditEvents(
      testDb,
      sql`action = 'project_member.created' and resource_id = ${member.id}`,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.transport).toBe("cli");
  });

  it("rejects a cross-organization user without persisting or auditing", async () => {
    const orgA = await makeProjectFixtureOrg(testDb);
    const orgB = await makeProjectFixtureOrg(testDb);
    const project = await createTestProject(testDb, orgA);
    const before = await countProjectMemberRows(testDb);
    const eventsBefore = await queryProjectAuditEvents(testDb, sql`action = 'project_member.created'`);

    await expect(
      withTenantContext(testDb.appDb, orgA.organizationId, (tx) =>
        addProjectMember(
          tx,
          orgA.actor,
          { projectId: project.id, userId: orgB.actorUserId },
          verifierFor(orgA, orgB),
        ),
      ),
    ).rejects.toThrow(ProjectUserNotFoundError);

    expect(await countProjectMemberRows(testDb)).toBe(before);
    const eventsAfter = await queryProjectAuditEvents(testDb, sql`action = 'project_member.created'`);
    expect(eventsAfter).toHaveLength(eventsBefore.length);
  });

  it("rejects duplicate membership", async () => {
    const fixture = await makeProjectFixtureOrg(testDb);
    const project = await createTestProject(testDb, fixture);

    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      addProjectMember(tx, fixture.actor, { projectId: project.id, userId: fixture.actorUserId }, verifierFor(fixture)),
    );

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        addProjectMember(tx, fixture.actor, { projectId: project.id, userId: fixture.actorUserId }, verifierFor(fixture)),
      ),
    ).rejects.toThrow(DuplicateProjectMemberError);
  });
});
