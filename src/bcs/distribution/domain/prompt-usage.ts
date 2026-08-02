export interface RecordPromptUsageParams {
  organizationId: string;
  promptId: string;
  promptVersionId: string;
  projectId?: string | null;
  userId?: string | null;
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
