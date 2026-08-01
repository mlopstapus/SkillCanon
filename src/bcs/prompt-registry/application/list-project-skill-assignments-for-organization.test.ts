import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { assignSkillToProject } from "./assign-skill-to-project";
import { listProjectSkillAssignmentsForOrganization } from "./list-project-skill-assignments-for-organization";
import { makeProjectTeamFixtureOrg } from "./project-team-test-helpers";
import { createTestSkillOwnedByTeam } from "./subscription-test-helpers";

describe("listProjectSkillAssignmentsForOrganization", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("returns every assignment in the organization", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);
    const skill = await createTestSkillOwnedByTeam(testDb, fixture.organizationId, fixture.ownerTeamId);

    const assignment = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      assignSkillToProject(tx, fixture.ownerTeamAdmin, fixture.projectId, skill.id, {
        requirement: "required",
      }),
    );

    const rows = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      listProjectSkillAssignmentsForOrganization(tx, fixture.organizationId),
    );

    expect(
      rows.some(
        (r) =>
          r.id === assignment.id &&
          r.projectId === fixture.projectId &&
          r.skillId === skill.id &&
          r.requirement === "required",
      ),
    ).toBe(true);
  });

  it("does not return another organization's assignments", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);
    const otherFixture = await makeProjectTeamFixtureOrg(testDb);
    const skill = await createTestSkillOwnedByTeam(testDb, otherFixture.organizationId, otherFixture.ownerTeamId);
    await withTenantContext(testDb.appDb, otherFixture.organizationId, (tx) =>
      assignSkillToProject(tx, otherFixture.ownerTeamAdmin, otherFixture.projectId, skill.id, {
        requirement: "optional",
      }),
    );

    const rows = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      listProjectSkillAssignmentsForOrganization(tx, fixture.organizationId),
    );

    expect(rows.some((r) => r.skillId === skill.id)).toBe(false);
  });
});
