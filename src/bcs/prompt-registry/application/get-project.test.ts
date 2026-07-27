import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { getProject } from "./get-project";
import { createTestProject, makeProjectFixtureOrg } from "./project-test-helpers";

describe("getProject", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("returns organization-scoped project metadata", async () => {
    const fixture = await makeProjectFixtureOrg(testDb);
    const project = await createTestProject(testDb, fixture, { name: "Readable" });

    await withTenantContext(testDb.appDb, fixture.organizationId, async (tx) => {
      await expect(getProject(tx, fixture.organizationId, project.id)).resolves.toMatchObject({
        id: project.id,
        organizationId: fixture.organizationId,
        teamId: fixture.teamId,
        name: "Readable",
      });
    });
  });

  it("returns null for a cross-organization project id", async () => {
    const orgA = await makeProjectFixtureOrg(testDb);
    const orgB = await makeProjectFixtureOrg(testDb);
    const projectB = await createTestProject(testDb, orgB);

    await withTenantContext(testDb.appDb, orgA.organizationId, async (tx) => {
      await expect(getProject(tx, orgA.organizationId, projectB.id)).resolves.toBeUndefined();
    });
  });
});
