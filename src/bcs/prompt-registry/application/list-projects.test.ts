import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { listProjectsByOrganization, listProjectsByTeam } from "./list-projects";
import { createTestProject, makeProjectFixtureOrg } from "./project-test-helpers";

describe("listProjects", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("lists only organization projects in name order", async () => {
    const orgA = await makeProjectFixtureOrg(testDb);
    const orgB = await makeProjectFixtureOrg(testDb);
    await createTestProject(testDb, orgA, { name: "Beta" });
    await createTestProject(testDb, orgA, { name: "Alpha" });
    await createTestProject(testDb, orgB, { name: "Other Org" });

    await withTenantContext(testDb.appDb, orgA.organizationId, async (tx) => {
      const names = (await listProjectsByOrganization(tx, orgA.organizationId)).map((row) => row.name);
      expect(names).toEqual(["Alpha", "Beta"]);
    });
  });

  it("lists only one team's projects in name order", async () => {
    const fixture = await makeProjectFixtureOrg(testDb);
    await createTestProject(testDb, fixture, { name: "Root Beta", teamId: fixture.teamId });
    await createTestProject(testDb, fixture, { name: "Other Alpha", teamId: fixture.otherTeamId });
    await createTestProject(testDb, fixture, { name: "Root Alpha", teamId: fixture.teamId });

    await withTenantContext(testDb.appDb, fixture.organizationId, async (tx) => {
      const names = (await listProjectsByTeam(tx, fixture.organizationId, fixture.teamId)).map((row) => row.name);
      expect(names).toEqual(["Root Alpha", "Root Beta"]);
    });
  });
});
