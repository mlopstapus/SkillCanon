import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { assignSkillToProject } from "./assign-skill-to-project";
import { makeProjectTeamFixtureOrg, queryProjectSkillAssignmentRows } from "./project-team-test-helpers";
import { subscribeSkill } from "./subscribe-skill";
import { unassignSkillFromProject } from "./unassign-skill-from-project";
import { unsubscribeSkill } from "./unsubscribe-skill";
import { createTestSkillOwnedByUser } from "./subscription-test-helpers";

// 015/006: a Share -> Project grant and a project assignment are one model.
describe("project grant <-> assignment", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  async function setup() {
    const fixture = await makeProjectTeamFixtureOrg(testDb);
    const skill = await createTestSkillOwnedByUser(testDb, fixture.organizationId, fixture.ownerTeamAdmin.id);
    
    const grant = () =>
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        subscribeSkill(tx, fixture.ownerTeamAdmin, skill.id, {
          subscriberType: "project",
          subscriberId: fixture.projectId,
        }),
      );
    const rows = () =>
      queryProjectSkillAssignmentRows(testDb, sql`project_id = ${fixture.projectId} and skill_id = ${skill.id}`);
    return { fixture, skill, grant, rows };
  }

  it("creates an optional assignment when a personal skill is granted to a project", async () => {
    const { grant, rows } = await setup();
    await grant();
    expect(await rows()).toHaveLength(1);
  });

  it("revoking the grant removes the optional assignment", async () => {
    const { fixture, grant, rows } = await setup();
    const sub = await grant();
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) => unsubscribeSkill(tx, fixture.ownerTeamAdmin, sub.id));
    expect(await rows()).toHaveLength(0);
  });

  it("removing the assignment also drops the grant", async () => {
    const { fixture, skill, grant, rows } = await setup();
    await grant();
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) => unassignSkillFromProject(tx, fixture.ownerTeamAdmin, fixture.projectId, skill.id));
    expect(await rows()).toHaveLength(0);
    await expect(grant()).resolves.toBeTruthy(); // grant row is gone, so re-granting is not a duplicate
  });

  it("keeps assignment API strict for personal skills", async () => {
    const { fixture, skill } = await setup();
    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        assignSkillToProject(tx, fixture.ownerTeamAdmin, fixture.projectId, skill.id, { requirement: "optional" }),
      ),
    ).rejects.toThrow();
  });
});
