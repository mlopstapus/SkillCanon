import { and, asc, eq, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { skillChainRunSteps } from "./schema";

type Tx = PostgresJsDatabase<Record<string, never>>;

export interface InsertSkillChainRunStepParams {
  id: string;
  runId: string;
  stepIndex: number;
  promptName: string;
  promptVersion: string;
  systemMessage: string | null;
  userMessage: string;
  appliedPolicies: string[];
  objectives: string[];
}

export async function insert(tx: Tx, params: InsertSkillChainRunStepParams) {
  const [row] = await tx.insert(skillChainRunSteps).values(params).returning();
  if (!row) {
    throw new Error("SkillChainRunStep insert returned no row.");
  }
  return row;
}

export async function listByRunId(tx: Tx, runId: string) {
  return tx
    .select()
    .from(skillChainRunSteps)
    .where(eq(skillChainRunSteps.runId, runId))
    .orderBy(asc(skillChainRunSteps.stepIndex));
}

export async function findPendingStep(tx: Tx, runId: string, stepIndex: number) {
  const [row] = await tx
    .select()
    .from(skillChainRunSteps)
    .where(
      and(
        eq(skillChainRunSteps.runId, runId),
        eq(skillChainRunSteps.stepIndex, stepIndex),
        isNull(skillChainRunSteps.reportedStatus),
      ),
    );
  return row ?? null;
}

export interface RecordReportParams {
  reportedStatus: "success" | "error";
  reportedOutput: string | null;
  reportedError: string | null;
}

export async function recordReport(tx: Tx, stepRowId: string, params: RecordReportParams) {
  const [row] = await tx
    .update(skillChainRunSteps)
    .set(params)
    .where(eq(skillChainRunSteps.id, stepRowId))
    .returning();
  if (!row) {
    throw new Error("SkillChainRunStep report update returned no row.");
  }
  return row;
}
