import { randomUUID } from "node:crypto";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { DEFAULT_WEB_AUDIT_CONTEXT, record, type AuditContext } from "@/bcs/audit-compliance";
import type { PromptActor } from "../domain/prompt";
import {
  MAX_REPORT_OUTPUT_BYTES,
  ReportOutputTooLargeError,
  RunAlreadyFinishedError,
  RunNotFoundError,
  RunStepConflictError,
  type AdvanceRunResult,
  type ChainStep,
  type ChainStepDependencyValue,
  type ChainStepReport,
} from "../domain/skill-chain";
import { findPromptByOrgAndId } from "../infrastructure/prompts-repo";
import { findVersionById } from "../infrastructure/prompt-versions-repo";
import * as runStepsRepo from "../infrastructure/skill-chain-run-steps-repo";
import * as runsRepo from "../infrastructure/skill-chain-runs-repo";
import { assertSkillAccessible } from "./authorize-chain-run-action";
import { resolveChainStep } from "./resolve-chain-step";

type Db = PostgresJsDatabase<Record<string, never>>;

function reportOutputByteLength(output: string | undefined): number {
  return output ? Buffer.byteLength(output, "utf8") : 0;
}

/**
 * Records the caller's self-reported outcome for the run's currently
 * pending step, then resolves and returns the next step's content — or
 * `{ done: true }` once no steps remain. Serialized per run via a
 * `SELECT ... FOR UPDATE` lock (research.md's concurrency decision): a
 * racing/duplicate call for the same run is rejected as a conflict
 * (FR-007a), and a call against an already-terminal run is rejected
 * outright (FR-007b) — never a silent no-op.
 */
export async function advanceSkillChainRun(
  db: Db,
  actor: PromptActor,
  runId: string,
  report: ChainStepReport,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
): Promise<AdvanceRunResult> {
  const outputBytes = reportOutputByteLength(report.output);
  if (outputBytes > MAX_REPORT_OUTPUT_BYTES) {
    throw new ReportOutputTooLargeError(outputBytes);
  }

  // See start-skill-chain-run.ts's identical comment: `db` here is always
  // the caller's own outer transaction, so a thrown error anywhere below —
  // including a system-resolution failure (FR-011) — rolls back this whole
  // call, leaving the run exactly as it was before (still in_progress, at
  // the same pending step, the just-recorded report undone too). The
  // caller can retry the same advance call later or call
  // abandonSkillChainRun to give up — the same "no auto-expiry, resumable"
  // philosophy already established for an idle run.
  return db.transaction(async (tx): Promise<AdvanceRunResult> => {
    const runRow = await runsRepo.findByIdForUpdate(tx, actor.organizationId, runId);
    if (!runRow) {
      throw new RunNotFoundError(runId);
    }

    const prompt = await findPromptByOrgAndId(tx, actor.organizationId, runRow.promptId);
    if (!prompt) {
      throw new RunNotFoundError(runId);
    }
    try {
      await assertSkillAccessible(tx, actor, prompt);
    } catch {
      throw new RunNotFoundError(runId);
    }

    if (runRow.status !== "in_progress") {
      throw new RunAlreadyFinishedError(runId);
    }

    // The primary conflict-detection mechanism (FR-007a): a report naming
    // a step index that's no longer the run's current pending step — e.g.
    // a stale network-retry duplicate of a report already processed by a
    // racing call that won the row-lock first — is rejected outright,
    // rather than silently misapplied to whatever step is now pending.
    if (report.stepIndex !== runRow.currentStepIndex) {
      throw new RunStepConflictError(runId);
    }

    const pendingStep = await runStepsRepo.findPendingStep(tx, runId, runRow.currentStepIndex);
    if (!pendingStep) {
      throw new RunStepConflictError(runId);
    }

    await runStepsRepo.recordReport(tx, pendingStep.id, {
      reportedStatus: report.status,
      reportedOutput: report.output ?? null,
      reportedError: report.error ?? null,
    });

    const chainVersion = await findVersionById(tx, runRow.promptVersionId);
    const steps = (chainVersion?.steps ?? []) as ChainStep[];
    const nextIndex = runRow.currentStepIndex + 1;

    if (nextIndex >= steps.length) {
      const everSucceeded = await allStepsSucceeded(tx, runId, report);
      const finalStatus = everSucceeded ? "completed" : "failed";
      await runsRepo.updateStatus(tx, runId, {
        status: finalStatus,
        currentStepIndex: runRow.currentStepIndex,
        completedAt: new Date(),
      });
      await record(tx, {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        actorApiKeyId: null,
        action: finalStatus === "completed" ? "skill_chain_run.completed" : "skill_chain_run.failed",
        resourceType: "skill_chain_run",
        resourceId: runId,
        before: null,
        after: { promptId: runRow.promptId, stepCount: steps.length },
        transport: auditContext.transport,
        sourceIp: auditContext.sourceIp ?? null,
      });
      return { done: true };
    }

    const nextStep = steps[nextIndex];
    if (!nextStep) {
      throw new Error("unreachable: nextIndex < steps.length already checked");
    }

    const input = await buildStepInput(tx, runId, steps, nextStep);

    // Any failure here (including ChainStepResolutionFailedError) propagates
    // and rolls back everything recorded in this call so far, including the
    // report just recorded above.
    const resolved = await resolveChainStep(tx, actor.organizationId, actor.userId, nextStep, input);

    const stepRow = await runStepsRepo.insert(tx, {
      id: randomUUID(),
      runId,
      stepIndex: nextIndex,
      promptName: nextStep.promptName,
      promptVersion: resolved.resolvedVersion,
      systemMessage: resolved.expansion.systemMessage,
      userMessage: resolved.expansion.userMessage,
      appliedPolicies: resolved.expansion.appliedPolicies,
      objectives: resolved.expansion.objectives,
    });
    await runsRepo.updateStatus(tx, runId, { status: "in_progress", currentStepIndex: nextIndex });

    return {
      step: {
        stepId: nextStep.id,
        stepIndex: nextIndex,
        promptName: nextStep.promptName,
        promptVersion: stepRow.promptVersion,
        systemMessage: stepRow.systemMessage,
        userMessage: stepRow.userMessage,
      },
    };
  });
}

/** True iff no run step (including the one just reported) was ever "error". */
async function allStepsSucceeded(tx: Db, runId: string, justReported: ChainStepReport): Promise<boolean> {
  if (justReported.status === "error") {
    return false;
  }
  const resolvedSteps = await runStepsRepo.listByRunId(tx, runId);
  return resolvedSteps.every((row) => row.reportedStatus !== "error");
}

/** Builds the `{ [depId]: { status, output } }` envelope for one step's dependsOn (research.md). */
async function buildStepInput(
  tx: Db,
  runId: string,
  chainSteps: ChainStep[],
  step: ChainStep,
): Promise<Record<string, ChainStepDependencyValue>> {
  if (step.dependsOn.length === 0) {
    return {};
  }
  const resolvedRows = await runStepsRepo.listByRunId(tx, runId);
  const rowsByStepIndex = new Map(resolvedRows.map((row) => [row.stepIndex, row]));
  const idToIndex = new Map(chainSteps.map((s, idx) => [s.id, idx]));

  const input: Record<string, ChainStepDependencyValue> = {};
  for (const depId of step.dependsOn) {
    const depIndex = idToIndex.get(depId);
    const depRow = depIndex !== undefined ? rowsByStepIndex.get(depIndex) : undefined;
    input[depId] =
      depRow && depRow.reportedStatus === "success"
        ? { status: "success", output: depRow.reportedOutput }
        : { status: "error", output: null };
  }
  return input;
}
