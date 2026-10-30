import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { EvalRunStatus } from "../domain/eval-run";
import { evalGates, evalProviderConfigs, evalResults, evalRuns, evalSettings } from "./schema";

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

export async function listProviderConfigs(tx: Tx, organizationId: string) {
  return tx.select().from(evalProviderConfigs).where(eq(evalProviderConfigs.organizationId, organizationId));
}

export async function upsertProviderConfig(
  tx: Tx,
  row: { organizationId: string; provider: "anthropic" | "openai"; apiKeyEnc: string; models: string[]; updatedBy: string },
) {
  await tx
    .insert(evalProviderConfigs)
    .values(row)
    .onConflictDoUpdate({
      target: [evalProviderConfigs.organizationId, evalProviderConfigs.provider],
      set: { apiKeyEnc: row.apiKeyEnc, models: row.models, updatedBy: row.updatedBy, updatedAt: new Date() },
    });
}

export async function deleteProviderConfig(tx: Tx, organizationId: string, provider: "anthropic" | "openai") {
  await tx
    .delete(evalProviderConfigs)
    .where(and(eq(evalProviderConfigs.organizationId, organizationId), eq(evalProviderConfigs.provider, provider)));
}

export async function getDefaultJudge(tx: Tx, organizationId: string) {
  const [row] = await tx.select().from(evalSettings).where(eq(evalSettings.organizationId, organizationId));
  return row?.defaultJudge ?? null;
}

export async function upsertDefaultJudge(tx: Tx, organizationId: string, defaultJudge: string | null, updatedBy: string) {
  await tx
    .insert(evalSettings)
    .values({ organizationId, defaultJudge, updatedBy })
    .onConflictDoUpdate({ target: evalSettings.organizationId, set: { defaultJudge, updatedBy, updatedAt: new Date() } });
}

/** Cross-org via a SECURITY DEFINER function (migration 0042); call on the plain app connection. */
export async function listQueuedRuns(db: Tx, limit: number): Promise<{ id: string; organizationId: string }[]> {
  const rows = await db.execute<{ id: string; organization_id: string }>(
    sql`select id, organization_id from prompt_registry.list_queued_eval_runs(${limit})`,
  );
  return rows.map((r) => ({ id: r.id, organizationId: r.organization_id }));
}

export async function failStaleRuns(db: Tx, olderThanSecs: number): Promise<number> {
  const rows = await db.execute<{ n: number }>(sql`select prompt_registry.fail_stale_eval_runs(${olderThanSecs}) as n`);
  return Number(rows[0]?.n ?? 0);
}

export async function getGate(tx: Tx, promptId: string) {
  const [row] = await tx.select().from(evalGates).where(eq(evalGates.promptId, promptId));
  return row ?? null;
}

export async function upsertGate(
  tx: Tx,
  row: { promptId: string; organizationId: string; enabled: boolean; models: string[]; minPassPct: number; updatedBy: string },
) {
  await tx
    .insert(evalGates)
    .values(row)
    .onConflictDoUpdate({
      target: evalGates.promptId,
      set: { enabled: row.enabled, models: row.models, minPassPct: row.minPassPct, updatedBy: row.updatedBy, updatedAt: new Date() },
    });
}
