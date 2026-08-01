import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { InvalidWorkflowStepsError, WorkflowProjectOrganizationMismatchError } from "../domain/workflow";
import { createWorkflow } from "./create-workflow";
import {
  createTestProjectInOrg,
  makeWorkflowFixtureOrg,
  queryWorkflowAuditEvents,
  queryWorkflowRows,
} from "./workflow-test-helpers";

describe("createWorkflow", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("creates a workflow and records one audit event", async () => {
    const fixture = await makeWorkflowFixtureOrg(testDb);

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      createWorkflow(
        tx,
        fixture.adminActor,
        {
          name: "Weekly Digest",
          description: "Summarize then translate",
          steps: [
            { id: "summarize", promptName: "summarize-notes" },
            { id: "translate", promptName: "translate-es", dependsOn: ["summarize"] },
          ],
        },
        { transport: "api", sourceIp: "198.51.100.8" },
      ),
    );

    expect(result.organizationId).toBe(fixture.organizationId);
    expect(result.userId).toBe(fixture.adminActor.id);
    expect(result.projectId).toBeNull();
    expect(result.name).toBe("Weekly Digest");
    expect(result.steps).toEqual([
      { id: "summarize", promptName: "summarize-notes", dependsOn: [] },
      { id: "translate", promptName: "translate-es", dependsOn: ["summarize"] },
    ]);

    const rows = await queryWorkflowRows(testDb, sql`id = ${result.id}`);
    expect(rows).toHaveLength(1);

    const events = await queryWorkflowAuditEvents(
      testDb,
      sql`action = 'workflow.created' and resource_id = ${result.id}`,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.transport).toBe("api");
    expect(events[0]?.source_ip).toBe("198.51.100.8");
  });

  it("creates a workflow scoped to a project in the same organization", async () => {
    const fixture = await makeWorkflowFixtureOrg(testDb);
    const project = await createTestProjectInOrg(testDb, fixture);

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      createWorkflow(tx, fixture.adminActor, { name: "Project Workflow", projectId: project.id, steps: [] }),
    );

    expect(result.projectId).toBe(project.id);
  });

  it("rejects a workflow scoped to a project from a different organization, with no row and no audit event", async () => {
    const fixture = await makeWorkflowFixtureOrg(testDb);
    const otherFixture = await makeWorkflowFixtureOrg(testDb);
    const otherOrgProject = await createTestProjectInOrg(testDb, otherFixture);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        createWorkflow(tx, fixture.adminActor, {
          name: "Cross Org",
          projectId: otherOrgProject.id,
          steps: [],
        }),
      ),
    ).rejects.toBeInstanceOf(WorkflowProjectOrganizationMismatchError);

    const rows = await queryWorkflowRows(testDb, sql`name = 'Cross Org'`);
    expect(rows).toHaveLength(0);
    const events = await queryWorkflowAuditEvents(testDb, sql`action = 'workflow.created'`);
    expect(events.filter((e) => e.resource_id === null)).toHaveLength(0);
  });

  it("succeeds when a step references a prompt name that doesn't exist anywhere", async () => {
    const fixture = await makeWorkflowFixtureOrg(testDb);

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      createWorkflow(tx, fixture.adminActor, {
        name: "Unresolved Prompt",
        steps: [{ id: "a", promptName: "does-not-exist-anywhere" }],
      }),
    );

    expect(result.steps[0]?.promptName).toBe("does-not-exist-anywhere");
  });

  it("succeeds with an empty step list", async () => {
    const fixture = await makeWorkflowFixtureOrg(testDb);

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      createWorkflow(tx, fixture.adminActor, { name: "Empty Steps", steps: [] }),
    );

    expect(result.steps).toEqual([]);
  });

  it("rejects a malformed step (missing promptName) with no row and no audit event", async () => {
    const fixture = await makeWorkflowFixtureOrg(testDb);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        createWorkflow(tx, fixture.adminActor, {
          name: "Malformed",
          steps: [{ id: "a" }],
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidWorkflowStepsError);

    const rows = await queryWorkflowRows(testDb, sql`name = 'Malformed'`);
    expect(rows).toHaveLength(0);
  });

  it("rejects a step list with a duplicate step id", async () => {
    const fixture = await makeWorkflowFixtureOrg(testDb);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        createWorkflow(tx, fixture.adminActor, {
          name: "Duplicate Step Id",
          steps: [
            { id: "a", promptName: "x" },
            { id: "a", promptName: "y" },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidWorkflowStepsError);

    const rows = await queryWorkflowRows(testDb, sql`name = 'Duplicate Step Id'`);
    expect(rows).toHaveLength(0);
  });
});
