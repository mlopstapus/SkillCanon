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
