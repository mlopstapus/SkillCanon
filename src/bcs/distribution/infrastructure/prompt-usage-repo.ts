import { and, asc, count, eq, gte, inArray, lte, max, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { normalizeGitRemoteUrl, type CommitUsage, type RecordPromptUsageParams, type Serve } from "../domain/prompt-usage";
import { promptUsage } from "./schema";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function insert<TSchema extends Record<string, unknown>>(
  tx: PostgresJsDatabase<TSchema>,
  params: RecordPromptUsageParams,
): Promise<string> {
  const [row] = await tx.insert(promptUsage).values({
    organizationId: params.organizationId,
    promptId: params.promptId,
    promptVersionId: params.promptVersionId,
    promptVersion: params.promptVersion ?? "unknown",
    projectId: params.projectId ?? null,
    userId: params.userId ?? null,
    statusCode: params.statusCode ?? 200,
    latencyMs: params.latencyMs ?? null,
    gitRemoteUrl: normalizeGitRemoteUrl(params.gitRemoteUrl),
    gitBranch: params.gitBranch ?? null,
    gitCommitSha: params.gitCommitSha?.toLowerCase() ?? null,
    contentDigest: params.contentDigest ?? null,
  }).returning({ id: promptUsage.id });
  if (!row) throw new Error("prompt_usage insert returned no row.");
  return row.id;
}

export async function findById<TSchema extends Record<string, unknown>>(
  tx: PostgresJsDatabase<TSchema>,
  organizationId: string,
  serveId: string,
): Promise<Serve | null> {
  // A malformed id is "not found", not a Postgres cast error.
  if (!UUID_PATTERN.test(serveId)) return null;
  const [row] = await tx
    .select()
    .from(promptUsage)
    .where(and(eq(promptUsage.organizationId, organizationId), eq(promptUsage.id, serveId)));
  if (!row) return null;
  return {
    serveId: row.id,
    promptId: row.promptId,
    promptVersionId: row.promptVersionId,
    version: row.promptVersion,
    contentDigest: row.contentDigest,
    userId: row.userId,
    projectId: row.projectId,
    createdAt: row.createdAt,
  };
}

export async function countTotalForProject<TSchema extends Record<string, unknown>>(
  tx: PostgresJsDatabase<TSchema>,
  organizationId: string,
  projectId: string,
): Promise<number> {
  const [row] = await tx
    .select({ total: count() })
    .from(promptUsage)
    .where(and(eq(promptUsage.organizationId, organizationId), eq(promptUsage.projectId, projectId)));
  return row?.total ?? 0;
}

export async function listSinceForProject<TSchema extends Record<string, unknown>>(
  tx: PostgresJsDatabase<TSchema>,
  organizationId: string,
  projectId: string,
  since: Date,
): Promise<Array<{ promptId: string; userId: string | null; createdAt: Date }>> {
  return tx
    .select({ promptId: promptUsage.promptId, userId: promptUsage.userId, createdAt: promptUsage.createdAt })
    .from(promptUsage)
    .where(
      and(
        eq(promptUsage.organizationId, organizationId),
        eq(promptUsage.projectId, projectId),
        gte(promptUsage.createdAt, since),
      ),
    );
}

export async function listGroupedBySkillForProject<TSchema extends Record<string, unknown>>(
  tx: PostgresJsDatabase<TSchema>,
  organizationId: string,
  projectId: string,
): Promise<Array<{ promptId: string; runCount: number; lastUsedAt: Date }>> {
  const rows = await tx
    .select({ promptId: promptUsage.promptId, runCount: count(), lastUsedAt: max(promptUsage.createdAt) })
    .from(promptUsage)
    .where(and(eq(promptUsage.organizationId, organizationId), eq(promptUsage.projectId, projectId)))
    .groupBy(promptUsage.promptId);
  return rows.map((r) => ({ promptId: r.promptId, runCount: r.runCount, lastUsedAt: new Date(r.lastUsedAt as unknown as string) }));
}

export async function listGroupedByMemberForProject<TSchema extends Record<string, unknown>>(
  tx: PostgresJsDatabase<TSchema>,
  organizationId: string,
  projectId: string,
): Promise<Array<{ userId: string | null; runCount: number; lastActiveAt: Date }>> {
  const rows = await tx
    .select({ userId: promptUsage.userId, runCount: count(), lastActiveAt: max(promptUsage.createdAt) })
    .from(promptUsage)
    .where(and(eq(promptUsage.organizationId, organizationId), eq(promptUsage.projectId, projectId)))
    .groupBy(promptUsage.userId);
  return rows.map((r) => ({ userId: r.userId, runCount: r.runCount, lastActiveAt: new Date(r.lastActiveAt as unknown as string) }));
}

export async function listDailyCountsBySkillForProject<TSchema extends Record<string, unknown>>(
  tx: PostgresJsDatabase<TSchema>,
  organizationId: string,
  projectId: string,
  since: Date,
): Promise<Array<{ day: string; promptId: string; count: number }>> {
  const dayExpr = sql<string>`to_char(date_trunc('day', ${promptUsage.createdAt}), 'YYYY-MM-DD')`;
  const rows = await tx
    .select({ day: dayExpr, promptId: promptUsage.promptId, count: count() })
    .from(promptUsage)
    .where(
      and(
        eq(promptUsage.organizationId, organizationId),
        eq(promptUsage.projectId, projectId),
        gte(promptUsage.createdAt, since),
      ),
    )
    .groupBy(dayExpr, promptUsage.promptId);
  return rows;
}

export interface PromptUsageOrganizationRow {
  promptId: string;
  promptVersionId: string;
  promptVersion: string;
  statusCode: number;
  latencyMs: number | null;
  createdAt: Date;
}

export async function listForOrganizationWindow<TSchema extends Record<string, unknown>>(
  tx: PostgresJsDatabase<TSchema>,
  organizationId: string,
  from: Date,
  to: Date,
): Promise<PromptUsageOrganizationRow[]> {
  return tx
    .select({
      promptId: promptUsage.promptId,
      promptVersionId: promptUsage.promptVersionId,
      promptVersion: promptUsage.promptVersion,
      statusCode: promptUsage.statusCode,
      latencyMs: promptUsage.latencyMs,
      createdAt: promptUsage.createdAt,
    })
    .from(promptUsage)
    .where(
      and(
        eq(promptUsage.organizationId, organizationId),
        gte(promptUsage.createdAt, from),
        lte(promptUsage.createdAt, to),
      ),
    )
    .orderBy(asc(promptUsage.createdAt));
}

/** Successful serves in one org for a normalized remote whose commit is in `commitShas`. */
export async function listByRemoteAndCommits<TSchema extends Record<string, unknown>>(
  tx: PostgresJsDatabase<TSchema>,
  organizationId: string,
  normalizedRemote: string,
  commitShas: string[],
): Promise<CommitUsage[]> {
  const rows = await tx
    .select({
      id: promptUsage.id,
      promptId: promptUsage.promptId,
      promptVersion: promptUsage.promptVersion,
      userId: promptUsage.userId,
      gitCommitSha: promptUsage.gitCommitSha,
      gitBranch: promptUsage.gitBranch,
      createdAt: promptUsage.createdAt,
    })
    .from(promptUsage)
    .where(
      and(
        eq(promptUsage.organizationId, organizationId),
        eq(promptUsage.gitRemoteUrl, normalizedRemote),
        inArray(promptUsage.gitCommitSha, commitShas),
        gte(promptUsage.statusCode, 200),
        lte(promptUsage.statusCode, 299),
      ),
    )
    .orderBy(asc(promptUsage.createdAt));
  return rows as CommitUsage[];
}
