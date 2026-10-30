import { createHash } from "node:crypto";

export interface RecordPromptUsageParams {
  organizationId: string;
  promptId: string;
  promptVersionId: string;
  promptVersion?: string | null;
  projectId?: string | null;
  userId?: string | null;
  statusCode?: number;
  latencyMs?: number | null;
  gitRemoteUrl?: string | null;
  gitBranch?: string | null;
  gitCommitSha?: string | null;
  contentDigest?: string | null;
}

/** One recorded serve (a `prompt_usage` row), as exposed by `getServe`. */
export interface Serve {
  serveId: string;
  promptId: string;
  promptVersionId: string;
  version: string;
  contentDigest: string | null;
  userId: string | null;
  projectId: string | null;
  createdAt: Date;
}

/** Lowercase hex SHA-256 of the exact text served, policies included. */
export function computeContentDigest(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export interface PromptUsageSummaryForProject {
  totalInvocations: number;
  windowRows: Array<{ promptId: string; userId: string | null; createdAt: Date }>;
  bySkill: Array<{ promptId: string; runCount: number; lastUsedAt: Date }>;
  byMember: Array<{ userId: string | null; runCount: number; lastActiveAt: Date }>;
  dailyCountsBySkill: Array<{ day: string; promptId: string; count: number }>;
}

export interface GetPromptUsageSummaryForProjectOptions {
  activeWindowDays: number;
  trendDays: number;
}

export interface PromptUsageWindow {
  from: Date;
  to: Date;
}

export interface PromptUsageSummaryForOrganization {
  window: PromptUsageWindow;
  totalInvocations: number;
  successCount: number;
  failureCount: number;
  averageLatencyMs: number | null;
  p95LatencyMs: number | null;
  byStatus: Array<{ statusCode: number; runCount: number }>;
  bySkill: Array<{
    promptId: string;
    promptVersionId: string;
    promptVersion: string;
    runCount: number;
    successCount: number;
    failureCount: number;
    averageLatencyMs: number | null;
    lastUsedAt: Date;
  }>;
  dailyCounts: Array<{ day: string; count: number }>;
}
