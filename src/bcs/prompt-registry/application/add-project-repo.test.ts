import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { DuplicateProjectRepoError } from "../domain/project-repo";
import { SubscriberNotAuthorizedError } from "../domain/subscription";
import { addProjectRepo } from "./add-project-repo";
import { makeProjectTeamFixtureOrg, queryAuditEvents } from "./project-team-test-helpers";

describe("addProjectRepo", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("owner-team admin links a repository and records a project_repo.added audit event", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      addProjectRepo(
        tx,
        fixture.ownerTeamAdmin,
        fixture.projectId,
        { name: "support-service", url: "github.com/acme/support-service", branch: "main" },
        { transport: "api", sourceIp: "10.0.0.5" },
      ),
    );

    expect(result.projectId).toBe(fixture.projectId);
    expect(result.url).toBe("github.com/acme/support-service");
    expect(result.branch).toBe("main");

    const events = await queryAuditEvents(
      testDb,
      sql`action = 'project_repo.added' and resource_id = ${result.id}`,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.transport).toBe("api");
  });

  it("defaults branch to 'main' when omitted", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      addProjectRepo(tx, fixture.ownerTeamAdmin, fixture.projectId, {
        name: "no-branch-given",
        url: "github.com/acme/no-branch-given",
      }),
    );

    expect(result.branch).toBe("main");
  });

  it("rejects a non-admin, non-owner caller", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        addProjectRepo(tx, fixture.nonAdminMember, fixture.projectId, {
          name: "unauthorized",
          url: "github.com/acme/unauthorized",
        }),
      ),
    ).rejects.toBeInstanceOf(SubscriberNotAuthorizedError);
  });

  it("rejects a duplicate (project, url) pair", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      addProjectRepo(tx, fixture.ownerTeamAdmin, fixture.projectId, {
        name: "dup",
        url: "github.com/acme/dup",
      }),
    );

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        addProjectRepo(tx, fixture.ownerTeamAdmin, fixture.projectId, {
          name: "dup-again",
          url: "github.com/acme/dup",
        }),
      ),
    ).rejects.toBeInstanceOf(DuplicateProjectRepoError);
  });
});
