import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { CrossOrgSubscriberError, SubscriberNotAuthorizedError } from "../domain/subscription";
import { assertAuthorizedForOwner } from "./authorize-owner-action";
import { makeProjectTeamFixtureOrg } from "./project-team-test-helpers";

describe("assertAuthorizedForOwner — ownerType: 'project'", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("allows an org admin to act for any project", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        assertAuthorizedForOwner(tx, fixture.ownerTeamAdmin, "project", fixture.projectId),
      ),
    ).resolves.toBeUndefined();
  });

  it("rejects a member with no authority over the project's owner team", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        assertAuthorizedForOwner(tx, fixture.nonAdminMember, "project", fixture.projectId),
      ),
    ).rejects.toBeInstanceOf(SubscriberNotAuthorizedError);
  });

  it("rejects a project id from a different organization", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);
    const otherFixture = await makeProjectTeamFixtureOrg(testDb);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        assertAuthorizedForOwner(tx, fixture.ownerTeamAdmin, "project", otherFixture.projectId),
      ),
    ).rejects.toBeInstanceOf(CrossOrgSubscriberError);
  });

  it("rejects a nonexistent project id", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        assertAuthorizedForOwner(tx, fixture.ownerTeamAdmin, "project", "00000000-0000-0000-0000-000000000000"),
      ),
    ).rejects.toBeInstanceOf(CrossOrgSubscriberError);
  });
});
