import { and, desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { RunStatus } from "../domain/skill-chain";
import { skillChainRuns } from "./schema";

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

export async function findByIdForOrg(tx: Tx, organizationId: string, runId: string) {
  const [row] = await tx
    .select()
    .from(skillChainRuns)
    .where(and(eq(skillChainRuns.id, runId), eq(skillChainRuns.organizationId, organizationId)));
  return row ?? null;
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

export async function listByPromptForOrg(tx: Tx, organizationId: string, promptId: string) {
  return tx
    .select()
    .from(skillChainRuns)
    .where(and(eq(skillChainRuns.organizationId, organizationId), eq(skillChainRuns.promptId, promptId)))
    .orderBy(desc(skillChainRuns.startedAt));
}
