import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recordPromptUsage } from "@/bcs/distribution";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { addProjectMember } from "./add-project-member";
import { assignSkillToProject } from "./assign-skill-to-project";
import { getProjectMetrics } from "./get-project-metrics";
import { makeIdentityVerifier } from "./project-test-helpers";
import { makeProjectTeamFixtureOrg, type ProjectTeamFixtureOrg } from "./project-team-test-helpers";
import { createTestSkillOwnedByTeam } from "./subscription-test-helpers";

async function addMember(testDb: TestDb, fixture: ProjectTeamFixtureOrg, userId: string) {
  const verifier = makeIdentityVerifier({
    organizationIds: [fixture.organizationId],
    teams: [],
    users: [{ id: userId, organizationId: fixture.organizationId }],
  });
  await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
    addProjectMember(tx, { organizationId: fixture.organizationId, userId: fixture.ownerTeamAdmin.id }, { projectId: fixture.projectId, userId }, verifier),
  );
}

async function assignRequiredSkill(testDb: TestDb, fixture: ProjectTeamFixtureOrg) {
  const skill = await createTestSkillOwnedByTeam(testDb, fixture.organizationId, fixture.ownerTeamId);
  await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
    assignSkillToProject(tx, fixture.ownerTeamAdmin, fixture.projectId, skill.id, { requirement: "required" }),
  );
  return skill.id;
}

describe("getProjectMetrics", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("returns all zeros/empty for an empty project, never an error", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);

    const metrics = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      getProjectMetrics(tx, fixture.organizationId, fixture.projectId),
    );

    expect(metrics.totalInvocations).toBe(0);
    expect(metrics.activeSkillCount).toBe(0);
    expect(metrics.activeContributorCount).toBe(0);
    expect(metrics.coverageLabel).toBe("—");
  });

  it("computes totalInvocations/activeSkillCount/activeContributorCount from seeded usage", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);
    const memberA = randomUUID();
    const memberB = randomUUID();
    await addMember(testDb, fixture, memberA);
    await addMember(testDb, fixture, memberB);
    const skillId = await assignRequiredSkill(testDb, fixture);

    await recordPromptUsage(testDb.appDb, {
      organizationId: fixture.organizationId,
      promptId: skillId,
      promptVersionId: randomUUID(),
      projectId: fixture.projectId,
      userId: memberA,
    });
    await recordPromptUsage(testDb.appDb, {
      organizationId: fixture.organizationId,
      promptId: skillId,
      promptVersionId: randomUUID(),
      projectId: fixture.projectId,
      userId: memberB,
    });

    const metrics = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      getProjectMetrics(tx, fixture.organizationId, fixture.projectId),
    );

    expect(metrics.totalInvocations).toBe(2);
    expect(metrics.activeSkillCount).toBe(1);
    expect(metrics.activeContributorCount).toBe(2);
    // Skill-level ratio (spec Acceptance Scenario 1.2): the single required skill was used by someone.
    expect(metrics.coverageLabel).toBe("1/1");
  });

  it("shows a neutral coverage state when the project has no required skills (Acceptance Scenario 1.3)", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);

    const metrics = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      getProjectMetrics(tx, fixture.organizationId, fixture.projectId),
    );

    expect(metrics.requiredSkillIds).toEqual([]);
    expect(metrics.coverageLabel).toBe("—");
    expect(metrics.hasCoverageGap).toBe(false);
  });

  it("flags a member missing a required skill in gapMembers, with the correct missingSkillIds", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);
    const memberCurrent = randomUUID();
    const memberMissing = randomUUID();
    await addMember(testDb, fixture, memberCurrent);
    await addMember(testDb, fixture, memberMissing);
    const skillId = await assignRequiredSkill(testDb, fixture);

    await recordPromptUsage(testDb.appDb, {
      organizationId: fixture.organizationId,
      promptId: skillId,
      promptVersionId: randomUUID(),
      projectId: fixture.projectId,
      userId: memberCurrent,
    });

    const metrics = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      getProjectMetrics(tx, fixture.organizationId, fixture.projectId),
    );

    expect(metrics.gapMembers).toEqual([{ userId: memberMissing, missingSkillIds: [skillId] }]);
    expect(metrics.allClear).toBe(false);
  });

  it("shows allClear when every member has used every required skill", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);
    const memberA = randomUUID();
    await addMember(testDb, fixture, memberA);
    const skillId = await assignRequiredSkill(testDb, fixture);

    await recordPromptUsage(testDb.appDb, {
      organizationId: fixture.organizationId,
      promptId: skillId,
      promptVersionId: randomUUID(),
      projectId: fixture.projectId,
      userId: memberA,
    });

    const metrics = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      getProjectMetrics(tx, fixture.organizationId, fixture.projectId),
    );

    expect(metrics.gapMembers).toEqual([]);
    expect(metrics.allClear).toBe(true);
  });

  it("flags a member with zero recorded activity at all as a gap on every required skill (Acceptance Scenario 2.3)", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);
    const memberActive = randomUUID();
    const memberInactive = randomUUID();
    await addMember(testDb, fixture, memberActive);
    const skillId = await assignRequiredSkill(testDb, fixture);
    await recordPromptUsage(testDb.appDb, {
      organizationId: fixture.organizationId,
      promptId: skillId,
      promptVersionId: randomUUID(),
      projectId: fixture.projectId,
      userId: memberActive,
    });

    const beforeInactiveMember = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      getProjectMetrics(tx, fixture.organizationId, fixture.projectId),
    );
    expect(beforeInactiveMember.coverageLabel).toBe("1/1");

    // Adding a fully inactive member changes the gap panel but must NOT change the
    // skill-level coverage tile — proving the two are independent computations
    // (research.md, quickstart.md Scenario 3).
    await addMember(testDb, fixture, memberInactive);

    const afterInactiveMember = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      getProjectMetrics(tx, fixture.organizationId, fixture.projectId),
    );

    expect(afterInactiveMember.coverageLabel).toBe("1/1");
    expect(afterInactiveMember.gapMembers).toEqual([{ userId: memberInactive, missingSkillIds: [skillId] }]);
  });

  it("computes bySkill/byMember with correct counts and dates, including a null-userId 'no user' bucket", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);
    const memberA = randomUUID();
    await addMember(testDb, fixture, memberA);
    const skillId = await assignRequiredSkill(testDb, fixture);

    await recordPromptUsage(testDb.appDb, {
      organizationId: fixture.organizationId,
      promptId: skillId,
      promptVersionId: randomUUID(),
      projectId: fixture.projectId,
      userId: memberA,
    });
    await recordPromptUsage(testDb.appDb, {
      organizationId: fixture.organizationId,
      promptId: skillId,
      promptVersionId: randomUUID(),
      projectId: fixture.projectId,
      userId: null,
    });

    const metrics = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      getProjectMetrics(tx, fixture.organizationId, fixture.projectId),
    );

    expect(metrics.bySkill).toEqual([{ promptId: skillId, requirement: "required", runCount: 2, lastUsedAt: expect.any(Date) }]);
    const byMemberByUserId = new Map(metrics.byMember.map((m) => [m.userId, m]));
    expect(byMemberByUserId.get(memberA)).toEqual({ userId: memberA, runCount: 1, lastActiveAt: expect.any(Date) });
    expect(byMemberByUserId.get(null)).toEqual({ userId: null, runCount: 1, lastActiveAt: expect.any(Date) });
  });

  it("returns a 14-entry trend, zero-filled for days with no invocations (Acceptance Scenario 3.2)", async () => {
    const fixture = await makeProjectTeamFixtureOrg(testDb);
    const skillId = await assignRequiredSkill(testDb, fixture);
    await recordPromptUsage(testDb.appDb, {
      organizationId: fixture.organizationId,
      promptId: skillId,
      promptVersionId: randomUUID(),
      projectId: fixture.projectId,
      userId: randomUUID(),
    });

    const metrics = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      getProjectMetrics(tx, fixture.organizationId, fixture.projectId),
    );

    expect(metrics.trend).toHaveLength(14);
    const today = new Date().toISOString().slice(0, 10);
    const todayEntry = metrics.trend.find((t) => t.day === today);
    expect(todayEntry?.countsByPromptId[skillId]).toBe(1);
    const emptyDayEntries = metrics.trend.filter((t) => t.day !== today);
    for (const entry of emptyDayEntries) {
      expect(entry.countsByPromptId).toEqual({});
    }
  });
});
