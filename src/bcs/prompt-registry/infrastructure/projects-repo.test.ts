import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isUniqueViolation } from "@/shared/db/postgres-errors";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { makeProjectFixtureOrg } from "../application/project-test-helpers";
import { insert, listByOrganization, listByTeam } from "./projects-repo";

describe("projects repository", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("enforces project name uniqueness within an organization", async () => {
    const fixture = await makeProjectFixtureOrg(testDb);
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      insert(tx, {
        id: randomUUID(),
        organizationId: fixture.organizationId,
        teamId: fixture.teamId,
        leadUserId: null,
        name: "Unique Name",
        slug: `slug-${randomUUID()}`,
        description: null,
      }),
    );

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        insert(tx, {
          id: randomUUID(),
          organizationId: fixture.organizationId,
          teamId: fixture.teamId,
          leadUserId: null,
          name: "Unique Name",
          slug: `slug-${randomUUID()}`,
          description: null,
        }),
      ),
    ).rejects.toSatisfy(isUniqueViolation);
  });

  it("enforces project slug uniqueness within an organization", async () => {
    const fixture = await makeProjectFixtureOrg(testDb);
    const slug = `slug-${randomUUID()}`;
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      insert(tx, {
        id: randomUUID(),
        organizationId: fixture.organizationId,
        teamId: fixture.teamId,
        leadUserId: null,
        name: "First Slug",
        slug,
        description: null,
      }),
    );

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        insert(tx, {
          id: randomUUID(),
          organizationId: fixture.organizationId,
          teamId: fixture.teamId,
          leadUserId: null,
          name: "Second Slug",
          slug,
          description: null,
        }),
      ),
    ).rejects.toSatisfy(isUniqueViolation);
  });

  it("orders organization and team project lists by name", async () => {
    const fixture = await makeProjectFixtureOrg(testDb);
    await withTenantContext(testDb.appDb, fixture.organizationId, async (tx) => {
      await insert(tx, {
        id: randomUUID(),
        organizationId: fixture.organizationId,
        teamId: fixture.teamId,
        leadUserId: null,
        name: "Beta",
        slug: `beta-${randomUUID()}`,
        description: null,
      });
      await insert(tx, {
        id: randomUUID(),
        organizationId: fixture.organizationId,
        teamId: fixture.teamId,
        leadUserId: null,
        name: "Alpha",
        slug: `alpha-${randomUUID()}`,
        description: null,
      });
      expect((await listByOrganization(tx, fixture.organizationId)).map((row) => row.name)).toEqual([
        "Alpha",
        "Beta",
      ]);
      expect((await listByTeam(tx, fixture.organizationId, fixture.teamId)).map((row) => row.name)).toEqual([
        "Alpha",
        "Beta",
      ]);
    });
  });
});
