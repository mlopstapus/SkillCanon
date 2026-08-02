import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { recordPromptUsage } from "./record-prompt-usage";
import { getPromptUsageSummaryForProject } from "./get-prompt-usage-summary-for-project";

const OPTIONS = { activeWindowDays: 30, trendDays: 14 };

describe("getPromptUsageSummaryForProject", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("returns an empty summary for a project with no usage, never an error", async () => {
    const organizationId = randomUUID();
    const projectId = randomUUID();

    const summary = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      getPromptUsageSummaryForProject(tx, organizationId, projectId, OPTIONS),
    );

    expect(summary).toEqual({
      totalInvocations: 0,
      windowRows: [],
      bySkill: [],
      byMember: [],
      dailyCountsBySkill: [],
    });
  });

  it("computes totalInvocations/windowRows/bySkill/byMember/dailyCountsBySkill from seeded usage", async () => {
    const organizationId = randomUUID();
    const projectId = randomUUID();
    const userA = randomUUID();
    const userB = randomUUID();
    const skillA = randomUUID();
    const skillB = randomUUID();
    const versionA = randomUUID();
    const versionB = randomUUID();

    await withTenantContext(testDb.appDb, organizationId, async (tx) => {
      await recordPromptUsage(tx, { organizationId, promptId: skillA, promptVersionId: versionA, projectId, userId: userA });
      await recordPromptUsage(tx, { organizationId, promptId: skillA, promptVersionId: versionA, projectId, userId: userB });
      await recordPromptUsage(tx, { organizationId, promptId: skillB, promptVersionId: versionB, projectId, userId: null });
    });

    const summary = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      getPromptUsageSummaryForProject(tx, organizationId, projectId, OPTIONS),
    );

    expect(summary.totalInvocations).toBe(3);
    expect(summary.windowRows).toHaveLength(3);
    expect(summary.bySkill.sort((a, b) => b.runCount - a.runCount)).toEqual([
      { promptId: skillA, runCount: 2, lastUsedAt: expect.any(Date) },
      { promptId: skillB, runCount: 1, lastUsedAt: expect.any(Date) },
    ]);
    const byMemberByUserId = new Map(summary.byMember.map((m) => [m.userId, m]));
    expect(byMemberByUserId.get(userA)).toEqual({ userId: userA, runCount: 1, lastActiveAt: expect.any(Date) });
    expect(byMemberByUserId.get(userB)).toEqual({ userId: userB, runCount: 1, lastActiveAt: expect.any(Date) });
    expect(byMemberByUserId.get(null)).toEqual({ userId: null, runCount: 1, lastActiveAt: expect.any(Date) });
    expect(summary.dailyCountsBySkill.length).toBeGreaterThan(0);
  });

  it("never includes a row seeded with a null projectId (ad hoc usage) in any project's summary", async () => {
    const organizationId = randomUUID();
    const projectId = randomUUID();

    await withTenantContext(testDb.appDb, organizationId, (tx) =>
      recordPromptUsage(tx, {
        organizationId,
        promptId: randomUUID(),
        promptVersionId: randomUUID(),
        projectId: null,
        userId: randomUUID(),
      }),
    );

    const summary = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      getPromptUsageSummaryForProject(tx, organizationId, projectId, OPTIONS),
    );

    expect(summary.totalInvocations).toBe(0);
  });

  it("never returns another organization's usage rows, even given the same projectId", async () => {
    const orgA = randomUUID();
    const orgB = randomUUID();
    const sharedProjectId = randomUUID();

    await withTenantContext(testDb.appDb, orgA, (tx) =>
      recordPromptUsage(tx, {
        organizationId: orgA,
        promptId: randomUUID(),
        promptVersionId: randomUUID(),
        projectId: sharedProjectId,
        userId: randomUUID(),
      }),
    );

    const summaryForOrgB = await withTenantContext(testDb.appDb, orgB, (tx) =>
      getPromptUsageSummaryForProject(tx, orgB, sharedProjectId, OPTIONS),
    );

    expect(summaryForOrgB.totalInvocations).toBe(0);
    expect(summaryForOrgB.byMember).toEqual([]);
  });
});
