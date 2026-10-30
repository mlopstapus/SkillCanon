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

/**
 * Canonical form of a git remote so a clone over SSH and over HTTPS of the
 * same repo compare equal: `host/owner/repo`, lower-cased, no scheme, no
 * credentials, no `.git`, no trailing slash. Returns null for anything that is
 * not a recognizable remote (git context is best-effort, never an error).
 * Covers GitHub's scp-style (`git@host:owner/repo`), `ssh://`, `git://` and
 * `http(s)://` forms; other hosts normalize the same way (PDR-013).
 */
export function normalizeGitRemoteUrl(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  let host: string;
  let path: string;
  const scp = /^(?:[^@/\s]+@)?([^:/\s]+):(?!\/\/)(.+)$/.exec(value);
  if (scp) {
    [, host, path] = scp as unknown as [string, string, string];
  } else {
    try {
      const url = new URL(value);
      if (!["http:", "https:", "ssh:", "git:"].includes(url.protocol)) return null;
      host = url.hostname;
      path = url.pathname;
    } catch {
      return null;
    }
  }
  path = path.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "");
  if (!host || !path.includes("/")) return null;
  return `${host}/${path}`.toLowerCase();
}

/** One usage row as returned to VCS evaluation: only what correlating to commits needs. */
export interface CommitUsage {
  id: string;
  promptId: string;
  promptVersion: string;
  userId: string | null;
  gitCommitSha: string;
  gitBranch: string | null;
  createdAt: Date;
}
