import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { GetPromptUsageSummaryForProjectOptions, PromptUsageSummaryForProject } from "../domain/prompt-usage";
import {
  countTotalForProject,
  listDailyCountsBySkillForProject,
  listGroupedByMemberForProject,
  listGroupedBySkillForProject,
  listSinceForProject,
} from "../infrastructure/prompt-usage-repo";

/**
 * The one composed, cross-BC read `prompt-registry` calls to build a
 * project's usage metrics. Every internal query is scoped by both
 * `organizationId` and `projectId` — a cross-org `projectId` returns the
 * same empty shape as a nonexistent one, never a distinguishing error.
 */
export async function getPromptUsageSummaryForProject<TSchema extends Record<string, unknown>>(
  db: PostgresJsDatabase<TSchema>,
  organizationId: string,
  projectId: string,
  options: GetPromptUsageSummaryForProjectOptions,
): Promise<PromptUsageSummaryForProject> {
  const activeWindowSince = new Date(Date.now() - options.activeWindowDays * 24 * 60 * 60 * 1000);
  const trendSince = new Date(Date.now() - options.trendDays * 24 * 60 * 60 * 1000);

  const [totalInvocations, windowRows, bySkill, byMember, dailyCountsBySkill] = await Promise.all([
    countTotalForProject(db, organizationId, projectId),
    listSinceForProject(db, organizationId, projectId, activeWindowSince),
    listGroupedBySkillForProject(db, organizationId, projectId),
    listGroupedByMemberForProject(db, organizationId, projectId),
    listDailyCountsBySkillForProject(db, organizationId, projectId, trendSince),
  ]);

  return { totalInvocations, windowRows, bySkill, byMember, dailyCountsBySkill };
}
