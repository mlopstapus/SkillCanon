import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { ProjectNotFoundError, ProjectUserNotFoundError } from "../domain/project";
import { updateProject } from "./update-project";
import {
  createTestProject,
  makeProjectFixtureOrg,
  queryProjectAuditEvents,
  verifierFor,
} from "./project-test-helpers";

describe("updateProject", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("updates editable metadata and records one audit event", async () => {
    const fixture = await makeProjectFixtureOrg(testDb);
    const project = await createTestProject(testDb, fixture, { description: "Before" });

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      updateProject(
        tx,
        fixture.actor,
        project.id,
        { name: "After", description: "Updated", leadUserId: fixture.otherUserId },
        verifierFor(fixture),
      ),
    );

    expect(result.name).toBe("After");
    expect(result.description).toBe("Updated");
    expect(result.leadUserId).toBe(fixture.otherUserId);
    const events = await queryProjectAuditEvents(
      testDb,
      sql`action = 'project.updated' and resource_id = ${project.id}`,
    );
    expect(events).toHaveLength(1);
  });

  it("rejects a cross-organization lead update without auditing", async () => {
    const orgA = await makeProjectFixtureOrg(testDb);
    const orgB = await makeProjectFixtureOrg(testDb);
    const project = await createTestProject(testDb, orgA);
    const eventsBefore = await queryProjectAuditEvents(testDb, sql`action = 'project.updated'`);

    await expect(
      withTenantContext(testDb.appDb, orgA.organizationId, (tx) =>
        updateProject(
          tx,
          orgA.actor,
          project.id,
          { leadUserId: orgB.actorUserId },
          verifierFor(orgA, orgB),
        ),
      ),
    ).rejects.toThrow(ProjectUserNotFoundError);

    const eventsAfter = await queryProjectAuditEvents(testDb, sql`action = 'project.updated'`);
    expect(eventsAfter).toHaveLength(eventsBefore.length);
  });

  it("treats cross-organization project ids as not found", async () => {
    const orgA = await makeProjectFixtureOrg(testDb);
    const orgB = await makeProjectFixtureOrg(testDb);
    const projectB = await createTestProject(testDb, orgB);

    await expect(
      withTenantContext(testDb.appDb, orgA.organizationId, (tx) =>
        updateProject(tx, orgA.actor, projectB.id, { name: "Nope" }, verifierFor(orgA, orgB)),
      ),
    ).rejects.toThrow(ProjectNotFoundError);
  });
});
