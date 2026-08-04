import { and, count, desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { RunStatus } from "../domain/skill-chain";
import { promptVersions, skillChainRuns } from "./schema";

type Tx = PostgresJsDatabase<Record<string, never>>;

export interface InsertSkillChainRunParams {
  id: string;
  organizationId: string;
  promptId: string;
  promptVersionId: string;
  userId: string;
  status: RunStatus;
  currentStepIndex: number;
  completedAt?: Date | null;
}

export async function insert(tx: Tx, params: InsertSkillChainRunParams) {
  const [row] = await tx.insert(skillChainRuns).values(params).returning();
  if (!row) {
    throw new Error("SkillChainRun insert returned no row.");
  }
  return row;
}

/**
 * Row-locking read — the entire concurrency-control mechanism for
 * `advanceSkillChainRun`/`abandonSkillChainRun` (research.md). Must be
 * called inside an open transaction; the lock is held until that
 * transaction commits or rolls back.
 */
export async function findByIdForUpdate(tx: Tx, organizationId: string, runId: string) {
  const [row] = await tx
    .select()
    .from(skillChainRuns)
    .where(and(eq(skillChainRuns.id, runId), eq(skillChainRuns.organizationId, organizationId)))
    .for("update");
  return row ?? null;
}

/** Joins to `promptVersions` for the run's `version` label (027-skill-chain-views-ui). */
export async function findByIdForOrg(tx: Tx, organizationId: string, runId: string) {
  const [row] = await tx
    .select({ run: skillChainRuns, version: promptVersions.version })
    .from(skillChainRuns)
    .innerJoin(promptVersions, eq(promptVersions.id, skillChainRuns.promptVersionId))
    .where(and(eq(skillChainRuns.id, runId), eq(skillChainRuns.organizationId, organizationId)));
  return row ? { ...row.run, version: row.version } : null;
}

export interface UpdateRunStatusParams {
  status: RunStatus;
  currentStepIndex?: number;
  completedAt?: Date | null;
}

export async function updateStatus(
  tx: Tx,
  runId: string,
  params: UpdateRunStatusParams,
) {
  const [row] = await tx
    .update(skillChainRuns)
    .set(params)
    .where(eq(skillChainRuns.id, runId))
    .returning();
  if (!row) {
    throw new Error("SkillChainRun update returned no row.");
  }
  return row;
}

/** Joins to `promptVersions` for each run's `version` label; paginated (027-skill-chain-views-ui). */
export async function listByPromptForOrg(
  tx: Tx,
  organizationId: string,
  promptId: string,
  limit: number,
  offset: number,
) {
  const rows = await tx
    .select({ run: skillChainRuns, version: promptVersions.version })
    .from(skillChainRuns)
    .innerJoin(promptVersions, eq(promptVersions.id, skillChainRuns.promptVersionId))
    .where(and(eq(skillChainRuns.organizationId, organizationId), eq(skillChainRuns.promptId, promptId)))
    .orderBy(desc(skillChainRuns.startedAt))
    .limit(limit)
    .offset(offset);
  return rows.map((row) => ({ ...row.run, version: row.version }));
}

export async function countByPromptForOrg(tx: Tx, organizationId: string, promptId: string) {
  const [row] = await tx
    .select({ count: count() })
    .from(skillChainRuns)
    .where(and(eq(skillChainRuns.organizationId, organizationId), eq(skillChainRuns.promptId, promptId)));
  return row?.count ?? 0;
}
