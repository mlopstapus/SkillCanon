import { randomUUID } from "node:crypto";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { DEFAULT_WEB_AUDIT_CONTEXT, record, type AuditContext } from "@/bcs/audit-compliance";
import { withAudit } from "@/shared/db";
import { PromptNotFoundError, type PromptActor } from "../domain/prompt";
import { NotAChainVersionError, validateChainSteps, type StartRunResult } from "../domain/skill-chain";
import { findPromptByOrgAndName } from "../infrastructure/prompts-repo";
import * as runStepsRepo from "../infrastructure/skill-chain-run-steps-repo";
import * as runsRepo from "../infrastructure/skill-chain-runs-repo";
import { assertSkillAccessible } from "./authorize-chain-run-action";
import { fetchExpandableVersion } from "./expand";
import { resolveChainStep } from "./resolve-chain-step";

type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Starts a run of a chain skill, resolving and returning step 0's content
 * (or `{ done: true }` immediately for a zero-step chain, FR-010).
 * Authorization is the same accessible-skill set `listPrompts` computes —
 * no chain-specific concept (spec Clarifications). Step dependencies are
 * validated before any run row is written (FR-006, SC-006).
 */
export async function startSkillChainRun(
  db: Db,
  actor: PromptActor,
  promptName: string,
  version?: string,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
): Promise<StartRunResult> {
  const prompt = await findPromptByOrgAndName(db, actor.organizationId, promptName);
  if (!prompt) {
    throw new PromptNotFoundError(promptName);
  }

  await assertSkillAccessible(db, actor, prompt);

  const topVersion = await fetchExpandableVersion(db, actor.organizationId, promptName, version);
  if (!topVersion) {
    throw new PromptNotFoundError(promptName);
  }
  if (topVersion.kind !== "chain") {
    throw new NotAChainVersionError(promptName);
  }

  const steps = topVersion.steps ?? [];
  validateChainSteps(steps);

  const runId = randomUUID();

  if (steps.length === 0) {
    await withAudit(
      db,
      (tx) =>
        runsRepo.insert(tx, {
          id: runId,
          organizationId: actor.organizationId,
          promptId: prompt.id,
          promptVersionId: topVersion.id,
          userId: actor.userId,
          status: "completed",
          currentStepIndex: 0,
          completedAt: new Date(),
        }),
      (tx) =>
        record(tx, {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          actorApiKeyId: null,
          action: "skill_chain_run.completed",
          resourceType: "skill_chain_run",
          resourceId: runId,
          before: null,
          after: { promptId: prompt.id, stepCount: 0 },
          transport: auditContext.transport,
          sourceIp: auditContext.sourceIp ?? null,
        }),
    );
    return { runId, done: true };
  }

  const firstStep = steps[0];
  if (!firstStep) {
    throw new Error("unreachable: steps.length > 0 already checked");
  }

  // `db` here is always the caller's own outer transaction (every caller,
  // per this codebase's convention, wraps the whole call in
  // withTenantContext) — so a thrown error anywhere below rolls back
  // *everything* in this call, including the run-row insert just below.
  // A system-resolution failure (FR-011) is therefore treated exactly like
  // any other validation failure (e.g. InvalidChainDependencyError): no run
  // row is ever left behind, and the thrown ChainStepResolutionFailedError
  // itself — structurally distinct from any normal `{ step }`/`{ done }`
  // return value — is what makes the failure "immediate and distinguishable"
  // from a caller-reported one, not a separately persisted "failed" row.
  return db.transaction(async (tx) => {
    await runsRepo.insert(tx, {
      id: runId,
      organizationId: actor.organizationId,
      promptId: prompt.id,
      promptVersionId: topVersion.id,
      userId: actor.userId,
      status: "in_progress",
      currentStepIndex: 0,
    });

    // Step 0 always has an empty dependsOn (validateChainSteps guarantees
    // nothing can precede it), so its input is always {}. Any failure here
    // (including ChainStepResolutionFailedError) propagates and rolls back
    // the run-row insert above.
    const resolved = await resolveChainStep(tx, actor.organizationId, actor.userId, firstStep, {});

    const stepRow = await runStepsRepo.insert(tx, {
      id: randomUUID(),
      runId,
      stepIndex: 0,
      promptName: firstStep.promptName,
      promptVersion: resolved.resolvedVersion,
      systemMessage: resolved.expansion.systemMessage,
      userMessage: resolved.expansion.userMessage,
      appliedPolicies: resolved.expansion.appliedPolicies,
      objectives: resolved.expansion.objectives,
    });

    return {
      runId,
      step: {
        stepId: firstStep.id,
        stepIndex: 0,
        promptName: firstStep.promptName,
        promptVersion: stepRow.promptVersion,
        systemMessage: stepRow.systemMessage,
        userMessage: stepRow.userMessage,
      },
    };
  });
}
