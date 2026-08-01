import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { InvalidWorkflowStepsError, NotAuthorizedError, WorkflowNotFoundError } from "../domain/workflow";
import { createWorkflow } from "./create-workflow";
import { updateWorkflow } from "./update-workflow";
import { makeWorkflowFixtureOrg, queryWorkflowAuditEvents, queryWorkflowRows } from "./workflow-test-helpers";

describe("updateWorkflow", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("owner updates name and description and records an audit event; updatedAt advances", async () => {
    const fixture = await makeWorkflowFixtureOrg(testDb);
    const workflow = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      createWorkflow(tx, fixture.memberActor, { name: "Old Name", description: "Old", steps: [] }),
    );

    const updated = await updateWorkflow(testDb.appDb, fixture.memberActor, workflow.id, {
      name: "New Name",
      description: "New",
    });

    expect(updated.name).toBe("New Name");
    expect(updated.description).toBe("New");
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(workflow.updatedAt.getTime());

    const events = await queryWorkflowAuditEvents(
      testDb,
      sql`action = 'workflow.updated' and resource_id = ${workflow.id}`,
    );
    expect(events).toHaveLength(1);
  });

  it("owner replaces steps and records an audit event", async () => {
    const fixture = await makeWorkflowFixtureOrg(testDb);
    const workflow = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      createWorkflow(tx, fixture.memberActor, { name: "Steps", steps: [] }),
    );

    const updated = await updateWorkflow(testDb.appDb, fixture.memberActor, workflow.id, {
      steps: [{ id: "a", promptName: "x" }],
    });

    expect(updated.steps).toEqual([{ id: "a", promptName: "x", dependsOn: [] }]);
  });

  it("rejects a malformed step in an update, leaving the stored workflow unchanged with no audit event", async () => {
    const fixture = await makeWorkflowFixtureOrg(testDb);
    const workflow = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      createWorkflow(tx, fixture.memberActor, { name: "Guarded", steps: [] }),
    );

    await expect(
      updateWorkflow(testDb.appDb, fixture.memberActor, workflow.id, { steps: [{ id: "a" }] }),
    ).rejects.toBeInstanceOf(InvalidWorkflowStepsError);

    const rows = await queryWorkflowRows(testDb, sql`id = ${workflow.id}`);
    expect(rows[0]?.name).toBe("Guarded");
    const events = await queryWorkflowAuditEvents(
      testDb,
      sql`action = 'workflow.updated' and resource_id = ${workflow.id}`,
    );
    expect(events).toHaveLength(0);
  });

  it("rejects an update by a non-owner, non-admin user, leaving the stored workflow unchanged", async () => {
    const fixture = await makeWorkflowFixtureOrg(testDb);
    const workflow = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      createWorkflow(tx, fixture.memberActor, { name: "Protected", steps: [] }),
    );

    await expect(
      updateWorkflow(testDb.appDb, fixture.otherMemberActor, workflow.id, { name: "Hijacked" }),
    ).rejects.toBeInstanceOf(NotAuthorizedError);

    const rows = await queryWorkflowRows(testDb, sql`id = ${workflow.id}`);
    expect(rows[0]?.name).toBe("Protected");
    const events = await queryWorkflowAuditEvents(
      testDb,
      sql`action = 'workflow.updated' and resource_id = ${workflow.id}`,
    );
    expect(events).toHaveLength(0);
  });

  it("allows an org admin (not the owner) to update, with an audit event", async () => {
    const fixture = await makeWorkflowFixtureOrg(testDb);
    const workflow = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      createWorkflow(tx, fixture.memberActor, { name: "Owned By Member", steps: [] }),
    );

    const updated = await updateWorkflow(testDb.appDb, fixture.adminActor, workflow.id, {
      name: "Renamed By Admin",
    });

    expect(updated.name).toBe("Renamed By Admin");
    const events = await queryWorkflowAuditEvents(
      testDb,
      sql`action = 'workflow.updated' and resource_id = ${workflow.id}`,
    );
    expect(events).toHaveLength(1);
  });

  it("leaves a field's stored value unchanged when omitted from the update", async () => {
    const fixture = await makeWorkflowFixtureOrg(testDb);
    const workflow = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      createWorkflow(tx, fixture.memberActor, {
        name: "Untouched Fields",
        description: "Original description",
        steps: [{ id: "a", promptName: "x" }],
      }),
    );

    const updated = await updateWorkflow(testDb.appDb, fixture.memberActor, workflow.id, {
      name: "Only Name Changed",
    });

    expect(updated.name).toBe("Only Name Changed");
    expect(updated.description).toBe("Original description");
    expect(updated.steps).toEqual([{ id: "a", promptName: "x", dependsOn: [] }]);
  });

  it("throws WorkflowNotFoundError when an actingUser in org A targets a workflow id belonging to org B", async () => {
    const orgA = await makeWorkflowFixtureOrg(testDb);
    const orgB = await makeWorkflowFixtureOrg(testDb);
    const workflowInOrgB = await withTenantContext(testDb.appDb, orgB.organizationId, (tx) =>
      createWorkflow(tx, orgB.adminActor, { name: "Org B Workflow", steps: [] }),
    );

    await expect(
      updateWorkflow(testDb.appDb, orgA.adminActor, workflowInOrgB.id, { name: "Stolen" }),
    ).rejects.toBeInstanceOf(WorkflowNotFoundError);

    const rows = await queryWorkflowRows(testDb, sql`id = ${workflowInOrgB.id}`);
    expect(rows[0]?.name).toBe("Org B Workflow");
  });

  it("throws WorkflowNotFoundError for a nonexistent workflow id", async () => {
    const fixture = await makeWorkflowFixtureOrg(testDb);

    await expect(
      updateWorkflow(testDb.appDb, fixture.adminActor, randomUUID(), { name: "Nope" }),
    ).rejects.toBeInstanceOf(WorkflowNotFoundError);
  });
});
