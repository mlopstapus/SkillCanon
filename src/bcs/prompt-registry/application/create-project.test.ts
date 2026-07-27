import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import {
  DuplicateProjectNameError,
  DuplicateProjectSlugError,
  ProjectTeamNotFoundError,
  ProjectUserNotFoundError,
} from "../domain/project";
import { createProject } from "./create-project";
import {
  countProjectRows,
  makeProjectFixtureOrg,
  queryProjectAuditEvents,
  queryProjectRows,
  verifierFor,
} from "./project-test-helpers";

describe("createProject", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("creates a project with a same-organization lead and records one audit event", async () => {
    const fixture = await makeProjectFixtureOrg(testDb);

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      createProject(
        tx,
        fixture.actor,
        {
          organizationId: fixture.organizationId,
          teamId: fixture.teamId,
          leadUserId: fixture.actorUserId,
          name: "Launch Work",
          slug: `launch-${randomUUID()}`,
          description: "Prompt launch workspace",
        },
        verifierFor(fixture),
        { transport: "api", sourceIp: "198.51.100.8" },
      ),
    );

    expect(result.organizationId).toBe(fixture.organizationId);
    expect(result.teamId).toBe(fixture.teamId);
    expect(result.leadUserId).toBe(fixture.actorUserId);
    expect(result.description).toBe("Prompt launch workspace");
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);

    const rows = await queryProjectRows(testDb, sql`id = ${result.id}`);
    expect(rows).toHaveLength(1);
    const events = await queryProjectAuditEvents(
      testDb,
      sql`action = 'project.created' and resource_id = ${result.id}`,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.transport).toBe("api");
    expect(events[0]?.source_ip).toBe("198.51.100.8");
  });

  it("creates a project without a lead user", async () => {
    const fixture = await makeProjectFixtureOrg(testDb);

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      createProject(
        tx,
        fixture.actor,
        {
          organizationId: fixture.organizationId,
          teamId: fixture.teamId,
          name: "No Lead",
          slug: `no-lead-${randomUUID()}`,
        },
        verifierFor(fixture),
      ),
    );

    expect(result.leadUserId).toBeNull();
  });

  it("rejects a team from another organization without persisting or auditing", async () => {
    const orgA = await makeProjectFixtureOrg(testDb);
    const orgB = await makeProjectFixtureOrg(testDb);
    const before = await countProjectRows(testDb);
    const eventsBefore = await queryProjectAuditEvents(testDb, sql`action = 'project.created'`);

    await expect(
      withTenantContext(testDb.appDb, orgA.organizationId, (tx) =>
        createProject(
          tx,
          orgA.actor,
          {
            organizationId: orgA.organizationId,
            teamId: orgB.teamId,
            name: "Wrong Team",
            slug: `wrong-team-${randomUUID()}`,
          },
          verifierFor(orgA, orgB),
        ),
      ),
    ).rejects.toThrow(ProjectTeamNotFoundError);

    expect(await countProjectRows(testDb)).toBe(before);
    const eventsAfter = await queryProjectAuditEvents(testDb, sql`action = 'project.created'`);
    expect(eventsAfter).toHaveLength(eventsBefore.length);
  });

  it("rejects a lead user from another organization without persisting or auditing", async () => {
    const orgA = await makeProjectFixtureOrg(testDb);
    const orgB = await makeProjectFixtureOrg(testDb);
    const before = await countProjectRows(testDb);

    await expect(
      withTenantContext(testDb.appDb, orgA.organizationId, (tx) =>
        createProject(
          tx,
          orgA.actor,
          {
            organizationId: orgA.organizationId,
            teamId: orgA.teamId,
            leadUserId: orgB.actorUserId,
            name: "Wrong Lead",
            slug: `wrong-lead-${randomUUID()}`,
          },
          verifierFor(orgA, orgB),
        ),
      ),
    ).rejects.toThrow(ProjectUserNotFoundError);

    expect(await countProjectRows(testDb)).toBe(before);
  });

  it("rejects duplicate project names and slugs within one organization", async () => {
    const fixture = await makeProjectFixtureOrg(testDb);
    const slug = `duplicate-${randomUUID()}`;
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      createProject(
        tx,
        fixture.actor,
        {
          organizationId: fixture.organizationId,
          teamId: fixture.teamId,
          name: "Duplicate Name",
          slug,
        },
        verifierFor(fixture),
      ),
    );

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        createProject(
          tx,
          fixture.actor,
          {
            organizationId: fixture.organizationId,
            teamId: fixture.teamId,
            name: "Duplicate Name",
            slug: `other-${randomUUID()}`,
          },
          verifierFor(fixture),
        ),
      ),
    ).rejects.toThrow(DuplicateProjectNameError);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        createProject(
          tx,
          fixture.actor,
          {
            organizationId: fixture.organizationId,
            teamId: fixture.teamId,
            name: "Other Name",
            slug,
          },
          verifierFor(fixture),
        ),
      ),
    ).rejects.toThrow(DuplicateProjectSlugError);
  });
});
