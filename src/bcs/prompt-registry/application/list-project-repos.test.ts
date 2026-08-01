import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { ProjectNotFoundError } from "../domain/project";
import { addProjectRepo } from "./add-project-repo";
import { listProjectRepos } from "./list-project-repos";
import { makeProjectTeamFixtureOrg } from "./project-team-test-helpers";

describe("listProjectRepos", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("returns every repo linked to a project", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      addProjectRepo(tx, fixture.ownerTeamAdmin, fixture.projectId, {
        name: "repo-a",
        url: "github.com/acme/repo-a",
      }),
    );
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      addProjectRepo(tx, fixture.ownerTeamAdmin, fixture.projectId, {
        name: "repo-b",
        url: "github.com/acme/repo-b",
      }),
    );

    const rows = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      listProjectRepos(tx, fixture.organizationId, fixture.projectId),
    );

    expect(rows.map((r) => r.name).sort()).toEqual(["repo-a", "repo-b"]);
  });

  it("rejects a nonexistent or cross-org project id", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        listProjectRepos(tx, fixture.organizationId, "00000000-0000-0000-0000-000000000000"),
      ),
    ).rejects.toBeInstanceOf(ProjectNotFoundError);
  });
});
