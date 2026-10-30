import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  countPrChecksByStatus,
  listLatestPrChecksForProject,
  type ProjectPrCheckRow,
} from "../infrastructure/installations-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

export interface ComplianceSummary {
  totalEvaluated: number;
  passed: number;
  failed: number;
  neutral: number;
  /** passed / (passed + failed); null when there is nothing to rate. Neutral (errored) checks are excluded: an infra error is not a missing skill. */
  rate: number | null;
}

/** Aggregates PR checks across every repo linked to the project. Visibility only, never a merge gate. */
export async function getComplianceSummaryForProject(
  db: Db,
  organizationId: string,
  projectId: string,
  options: { since?: Date } = {},
): Promise<ComplianceSummary> {
  const counts = await countPrChecksByStatus(db, organizationId, projectId, options.since);
  const rated = counts.pass + counts.fail;
  return {
    totalEvaluated: rated + counts.neutral,
    passed: counts.pass,
    failed: counts.fail,
    neutral: counts.neutral,
    rate: rated === 0 ? null : counts.pass / rated,
  };
}

/** The most recent evaluation of each PR for a project, newest first. */
export async function listRecentPrChecksForProject(
  db: Db,
  organizationId: string,
  projectId: string,
  limit = 50,
): Promise<ProjectPrCheckRow[]> {
  return listLatestPrChecksForProject(db, organizationId, projectId, limit);
}
