import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { DEFAULT_WEB_AUDIT_CONTEXT, record, type AuditContext } from "@/bcs/audit-compliance";
import type { PromptActor } from "../domain/prompt";
import { RunAlreadyFinishedError, RunNotFoundError } from "../domain/skill-chain";
import { findPromptByOrgAndId } from "../infrastructure/prompts-repo";
import * as runsRepo from "../infrastructure/skill-chain-runs-repo";
import { assertSkillAccessible } from "./authorize-chain-run-action";

type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Explicitly ends an in-progress run early (FR-009) — a sibling terminal
 * transition to `advanceSkillChainRun`, not a variant of a step report
 * (plan.md Complexity Tracking #1: ending a run isn't reporting an outcome
 * for the pending step, it's declining to continue at all). Same
 * access-scoping, row-locking, and terminal-state rejection as
 * `advanceSkillChainRun`. The pending step (if any) is left with
 * `reportedStatus: null` permanently — a distinct, meaningful "the run was
 * ended before this step's outcome was ever reported" state in history.
 */
export async function abandonSkillChainRun(
  db: Db,
  actor: PromptActor,
  runId: string,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
): Promise<void> {
  await db.transaction(async (tx) => {
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

    await runsRepo.updateStatus(tx, runId, { status: "abandoned", completedAt: new Date() });
    await record(tx, {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      actorApiKeyId: null,
      action: "skill_chain_run.abandoned",
      resourceType: "skill_chain_run",
      resourceId: runId,
      before: null,
      after: { promptId: runRow.promptId },
      transport: auditContext.transport,
      sourceIp: auditContext.sourceIp ?? null,
    });
  });
}
