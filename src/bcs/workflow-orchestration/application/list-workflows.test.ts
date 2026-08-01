import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { NotAuthorizedError } from "../domain/workflow";
import { createWorkflow } from "./create-workflow";
import { listWorkflows } from "./list-workflows";
import { createTestProjectInOrg, makeWorkflowFixtureOrg } from "./workflow-test-helpers";

describe("listWorkflows", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("scope self returns only the caller's own workflows", async () => {
    const fixture = await makeWorkflowFixtureOrg(testDb);
    const own = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      createWorkflow(tx, fixture.memberActor, { name: "Mine", steps: [] }),
    );
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      createWorkflow(tx, fixture.otherMemberActor, { name: "Not Mine", steps: [] }),
    );

    const result = await listWorkflows(testDb.appDb, fixture.memberActor, { scope: "self" });

    expect(result.map((w) => w.id)).toEqual([own.id]);
  });

  it("admin scope project returns only that project's workflows regardless of owner", async () => {
    const fixture = await makeWorkflowFixtureOrg(testDb);
    const project = await createTestProjectInOrg(testDb, fixture);
    const inProject = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      createWorkflow(tx, fixture.memberActor, { name: "In Project", projectId: project.id, steps: [] }),
    );
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      createWorkflow(tx, fixture.otherMemberActor, { name: "No Project", steps: [] }),
    );

    const result = await listWorkflows(testDb.appDb, fixture.adminActor, {
      scope: "project",
      projectId: project.id,
    });

    expect(result.map((w) => w.id)).toEqual([inProject.id]);
  });

  it("admin scope organization returns every org workflow and none from other orgs", async () => {
    const fixture = await makeWorkflowFixtureOrg(testDb);
    const otherFixture = await makeWorkflowFixtureOrg(testDb);
    const a = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      createWorkflow(tx, fixture.memberActor, { name: "A", steps: [] }),
    );
    const b = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      createWorkflow(tx, fixture.otherMemberActor, { name: "B", steps: [] }),
    );
    await withTenantContext(testDb.appDb, otherFixture.organizationId, (tx) =>
      createWorkflow(tx, otherFixture.adminActor, { name: "Other Org", steps: [] }),
    );

    const result = await listWorkflows(testDb.appDb, fixture.adminActor, { scope: "organization" });

    expect(result.map((w) => w.id).sort()).toEqual([a.id, b.id].sort());
  });

  it("returns an empty list, not an error, for an org with no workflows", async () => {
    const fixture = await makeWorkflowFixtureOrg(testDb);

    const result = await listWorkflows(testDb.appDb, fixture.adminActor, { scope: "organization" });

    expect(result).toEqual([]);
  });

  it("orders results by most-recently-updated first", async () => {
    const fixture = await makeWorkflowFixtureOrg(testDb);
    const first = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      createWorkflow(tx, fixture.adminActor, { name: "First", steps: [] }),
    );
    const second = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      createWorkflow(tx, fixture.adminActor, { name: "Second", steps: [] }),
    );
    // Force a deterministic ordering rather than relying on real-time gaps
    // between two `defaultNow()` inserts, which can land in the same tick.
    await testDb.ownerDb.execute(
      sql`update workflow.workflows set updated_at = '2020-01-01T00:00:00Z' where id = ${first.id}`,
    );
    await testDb.ownerDb.execute(
      sql`update workflow.workflows set updated_at = '2020-01-02T00:00:00Z' where id = ${second.id}`,
    );

    const result = await listWorkflows(testDb.appDb, fixture.adminActor, { scope: "organization" });

    expect(result.map((w) => w.id)).toEqual([second.id, first.id]);
  });

  it("rejects a non-admin listing by scope user", async () => {
    const fixture = await makeWorkflowFixtureOrg(testDb);

    await expect(
      listWorkflows(testDb.appDb, fixture.memberActor, { scope: "user", userId: fixture.otherMemberActor.id }),
    ).rejects.toBeInstanceOf(NotAuthorizedError);
  });

  it("rejects a non-admin listing by scope organization or scope project", async () => {
    const fixture = await makeWorkflowFixtureOrg(testDb);

    await expect(
      listWorkflows(testDb.appDb, fixture.memberActor, { scope: "organization" }),
    ).rejects.toBeInstanceOf(NotAuthorizedError);
    await expect(
      listWorkflows(testDb.appDb, fixture.memberActor, { scope: "project", projectId: "irrelevant" }),
    ).rejects.toBeInstanceOf(NotAuthorizedError);
  });
});
