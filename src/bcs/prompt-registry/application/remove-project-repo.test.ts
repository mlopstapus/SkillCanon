import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { ProjectRepoNotFoundError } from "../domain/project-repo";
import { SubscriberNotAuthorizedError } from "../domain/subscription";
import { addProjectRepo } from "./add-project-repo";
import { makeProjectTeamFixtureOrg, queryAuditEvents } from "./project-team-test-helpers";
import { removeProjectRepo } from "./remove-project-repo";

describe("removeProjectRepo", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("owner-team admin removes a linked repository and records an audit event", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);
    const repo = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      addProjectRepo(tx, fixture.ownerTeamAdmin, fixture.projectId, {
        name: "to-remove",
        url: "github.com/acme/to-remove",
      }),
    );

    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      removeProjectRepo(tx, fixture.ownerTeamAdmin, fixture.projectId, repo.id, {
        transport: "api",
        sourceIp: "10.0.0.6",
      }),
    );

    const events = await queryAuditEvents(
      testDb,
      sql`action = 'project_repo.removed' and resource_id = ${repo.id}`,
    );
    expect(events).toHaveLength(1);
  });

  it("rejects a non-admin, non-owner caller", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);
    const repo = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      addProjectRepo(tx, fixture.ownerTeamAdmin, fixture.projectId, {
        name: "guarded",
        url: "github.com/acme/guarded",
      }),
    );

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        removeProjectRepo(tx, fixture.nonAdminMember, fixture.projectId, repo.id),
      ),
    ).rejects.toBeInstanceOf(SubscriberNotAuthorizedError);
  });

  it("rejects removing a repo id that isn't linked to this project", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        removeProjectRepo(tx, fixture.ownerTeamAdmin, fixture.projectId, "00000000-0000-0000-0000-000000000000"),
      ),
    ).rejects.toBeInstanceOf(ProjectRepoNotFoundError);
  });
});
