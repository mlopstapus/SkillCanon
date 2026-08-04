import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { ChainRunStepRecord, ChainRunSummary } from "../domain/skill-chain";
import { listByRunId } from "../infrastructure/skill-chain-run-steps-repo";
import { findByIdForOrg } from "../infrastructure/skill-chain-runs-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * One run plus its full step history — a pure, org-scoped read (FR-013).
 * Returns `null` for a nonexistent run id **and** for a run belonging to a
 * different organization (RLS makes the row invisible before any app-layer
 * comparison runs) — the same shape either way, never a distinguishing
 * error (SC-005).
 */
export async function getSkillChainRun(
  db: Db,
  organizationId: string,
  runId: string,
): Promise<{ run: ChainRunSummary; steps: ChainRunStepRecord[] } | null> {
  const runRow = await findByIdForOrg(db, organizationId, runId);
  if (!runRow) {
    return null;
  }

  const stepRows = await listByRunId(db, runId);

  return {
    run: {
      id: runRow.id,
      promptId: runRow.promptId,
      version: runRow.version,
      userId: runRow.userId,
      status: runRow.status,
      currentStepIndex: runRow.currentStepIndex,
      startedAt: runRow.startedAt,
      completedAt: runRow.completedAt,
    },
    steps: stepRows.map((row) => ({
      id: row.id,
      runId: row.runId,
      stepIndex: row.stepIndex,
      promptName: row.promptName,
      promptVersion: row.promptVersion,
      resolvedAt: row.resolvedAt,
      systemMessage: row.systemMessage,
      userMessage: row.userMessage,
      appliedPolicies: row.appliedPolicies as string[],
      objectives: row.objectives as string[],
      reportedStatus: row.reportedStatus,
      reportedOutput: row.reportedOutput,
      reportedError: row.reportedError,
    })),
  };
}
