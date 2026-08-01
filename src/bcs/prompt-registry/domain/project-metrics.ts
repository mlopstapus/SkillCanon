export interface ProjectMetrics {
  totalInvocations: number;
  activeSkillCount: number;
  activeContributorCount: number;
  requiredSkillIds: string[];
  /** Skill-level ratio (e.g. "1/2"), or "—" when requiredSkillIds is empty. Independent of gapMembers — see research.md. */
  coverageLabel: string;
  hasCoverageGap: boolean;
  /** Member-level: which specific members are missing which specific required skills. Independent of coverageLabel. */
  gapMembers: Array<{ userId: string; missingSkillIds: string[] }>;
  allClear: boolean;
  bySkill: Array<{ promptId: string; requirement: "required" | "optional" | null; runCount: number; lastUsedAt: Date }>;
  byMember: Array<{ userId: string | null; runCount: number; lastActiveAt: Date }>;
  trend: Array<{ day: string; countsByPromptId: Record<string, number> }>;
}
