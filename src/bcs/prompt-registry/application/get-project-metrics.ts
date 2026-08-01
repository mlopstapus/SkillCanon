import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getPromptUsageSummaryForProject } from "@/bcs/distribution";
import type { ProjectMetrics } from "../domain/project-metrics";
import { listProjectMembers } from "./list-project-members";
import { listProjectSkillAssignmentsForOrganization } from "./list-project-skill-assignments-for-organization";

type Db = PostgresJsDatabase<Record<string, never>>;

const ACTIVE_WINDOW_DAYS = 30;
const TREND_DAYS = 14;

/**
 * Composes distribution's usage summary with this BC's own project
 * members / skill-requirement data into the Project Detail Metrics tab's
 * full data shape. Coverage tile (skill-level) and the gap panel
 * (member-level) are deliberately independent computations over the same
 * `windowRows` — see research.md of 024-project-usage-metrics-dashboard.
 */
export async function getProjectMetrics(db: Db, organizationId: string, projectId: string): Promise<ProjectMetrics> {
  const [summary, members, allAssignments] = await Promise.all([
    getPromptUsageSummaryForProject(db, organizationId, projectId, {
      activeWindowDays: ACTIVE_WINDOW_DAYS,
      trendDays: TREND_DAYS,
    }),
    listProjectMembers(db, organizationId, projectId),
    listProjectSkillAssignmentsForOrganization(db, organizationId),
  ]);

  const assignments = allAssignments.filter((a) => a.projectId === projectId);
  const requirementBySkillId = new Map(assignments.map((a) => [a.skillId, a.requirement]));
  const requiredSkillIds = assignments.filter((a) => a.requirement === "required").map((a) => a.skillId);

  const activeSkillIds = new Set(summary.windowRows.map((r) => r.promptId));
  const activeContributorIds = new Set(
    summary.windowRows.filter((r) => r.userId !== null).map((r) => r.userId as string),
  );

  const usedRequiredSkillIds = new Set(
    summary.windowRows.filter((r) => requiredSkillIds.includes(r.promptId)).map((r) => r.promptId),
  );
  const coverageLabel = requiredSkillIds.length > 0 ? `${usedRequiredSkillIds.size}/${requiredSkillIds.length}` : "—";
  const hasCoverageGap = requiredSkillIds.length > 0 && usedRequiredSkillIds.size < requiredSkillIds.length;

  // Member-level gap panel — independent of the skill-level coverageLabel above (research.md).
  const gapMembers = members
    .map((member) => {
      const usedByThisMember = new Set(
        summary.windowRows.filter((r) => r.userId === member.userId && requiredSkillIds.includes(r.promptId)).map((r) => r.promptId),
      );
      const missingSkillIds = requiredSkillIds.filter((skillId) => !usedByThisMember.has(skillId));
      return { userId: member.userId, missingSkillIds };
    })
    .filter((m) => requiredSkillIds.length > 0 && m.missingSkillIds.length > 0);
  const allClear = requiredSkillIds.length > 0 && gapMembers.length === 0;

  // 14-day trend, zero-filled — a day with no rows in dailyCountsBySkill still appears
  // with an empty countsByPromptId rather than being omitted (spec Acceptance Scenario 3.2).
  const trendDays: string[] = [];
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    trendDays.push(d.toISOString().slice(0, 10));
  }
  const trend = trendDays.map((day) => {
    const countsByPromptId: Record<string, number> = {};
    for (const row of summary.dailyCountsBySkill) {
      if (row.day === day) {
        countsByPromptId[row.promptId] = row.count;
      }
    }
    return { day, countsByPromptId };
  });

  return {
    totalInvocations: summary.totalInvocations,
    activeSkillCount: activeSkillIds.size,
    activeContributorCount: activeContributorIds.size,
    requiredSkillIds,
    coverageLabel,
    hasCoverageGap,
    gapMembers,
    allClear,
    bySkill: summary.bySkill.map((s) => ({ ...s, requirement: requirementBySkillId.get(s.promptId) ?? null })),
    byMember: summary.byMember,
    trend,
  };
}
