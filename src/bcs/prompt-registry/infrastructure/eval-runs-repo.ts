import { and, asc, desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { EvalRunStatus } from "../domain/eval-run";
import { evalResults, evalRuns, evalSettings } from "./schema";

type Tx = PostgresJsDatabase<Record<string, never>>;

export interface InsertEvalRunParams {
  id: string;
  organizationId: string;
  promptId: string;
  promptVersionId: string;
  contentDigest: string;
  models: string[];
  judge: string | null;
  requestedBy: string;
}

export async function insertRun(tx: Tx, params: InsertEvalRunParams) {
  const [row] = await tx.insert(evalRuns).values(params).returning();
  if (!row) throw new Error("Eval run insert returned no row.");
  return row;
}

export async function findRunByOrgAndId(tx: Tx, organizationId: string, id: string) {
  const [row] = await tx
    .select()
    .from(evalRuns)
    .where(and(eq(evalRuns.organizationId, organizationId), eq(evalRuns.id, id)));
  return row ?? null;
}

export async function listRunsByVersion(tx: Tx, organizationId: string, promptVersionId: string) {
  return tx
    .select()
    .from(evalRuns)
    .where(and(eq(evalRuns.organizationId, organizationId), eq(evalRuns.promptVersionId, promptVersionId)))
    .orderBy(desc(evalRuns.createdAt));
}

/** Atomically moves queued -> running; null when another worker already claimed it. */
export async function claimRun(tx: Tx, organizationId: string, id: string) {
  const [row] = await tx
    .update(evalRuns)
    .set({ status: "running", startedAt: new Date() })
    .where(and(eq(evalRuns.organizationId, organizationId), eq(evalRuns.id, id), eq(evalRuns.status, "queued")))
    .returning();
  return row ?? null;
}

export async function finishRun(
  tx: Tx,
  organizationId: string,
  id: string,
  status: Extract<EvalRunStatus, "succeeded" | "failed">,
  error: string | null,
) {
  await tx
    .update(evalRuns)
    .set({ status, error, finishedAt: new Date() })
    .where(and(eq(evalRuns.organizationId, organizationId), eq(evalRuns.id, id)));
}

export interface InsertEvalResultParams {
  organizationId: string;
  runId: string;
  model: string;
  caseId: string;
  passed: boolean;
  scorePct: number | null;
  latencyMs: number | null;
  tokens: number | null;
  error: string | null;
}

export async function insertResults(tx: Tx, rows: InsertEvalResultParams[]) {
  if (rows.length === 0) return;
  await tx.insert(evalResults).values(rows);
}

export async function listResultsByRun(tx: Tx, organizationId: string, runId: string) {
  return tx
    .select()
    .from(evalResults)
    .where(and(eq(evalResults.organizationId, organizationId), eq(evalResults.runId, runId)))
    .orderBy(asc(evalResults.model), asc(evalResults.caseId));
}

export async function isEvalsEnabled(tx: Tx, organizationId: string) {
  const [row] = await tx.select().from(evalSettings).where(eq(evalSettings.organizationId, organizationId));
  return row?.enabled ?? false;
}

export async function upsertEvalsEnabled(tx: Tx, organizationId: string, enabled: boolean, updatedBy: string) {
  await tx
    .insert(evalSettings)
    .values({ organizationId, enabled, updatedBy })
    .onConflictDoUpdate({ target: evalSettings.organizationId, set: { enabled, updatedBy, updatedAt: new Date() } });
}
