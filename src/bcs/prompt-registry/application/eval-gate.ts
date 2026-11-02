import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { DEFAULT_WEB_AUDIT_CONTEXT, record, type AuditContext } from "@/bcs/audit-compliance";
import { NotAuthorizedError, type UserSummary } from "@/bcs/identity-access";
import { withAudit } from "@/shared/db";
import { EVAL_CASES_FILE_NAME } from "../domain/eval-cases";
import {
  evaluateGate,
  EvalGateConfigInvalidError,
  VersionNotCandidateError,
  type EvalGateConfig,
} from "../domain/eval-gate";
import {
  EvalPoolNotConfiguredError,
  EvalRunNotFoundError,
  EvalsNotEnabledError,
  MAX_EVAL_MODELS,
} from "../domain/eval-run";
import { PromptNotFoundError, PromptVersionNotFoundError, type PromptActor } from "../domain/prompt";
import { findRunByOrgAndId, getGate, isEvalsEnabled, listResultsByRun, upsertGate } from "../infrastructure/eval-runs-repo";
import { findPromptByOrgAndId, findPromptByOrgAndName, updatePrompt } from "../infrastructure/prompts-repo";
import { findVersionById, findVersionByPromptAndLabel, listVersionsByPrompt } from "../infrastructure/prompt-versions-repo";
import { assertAuthorizedForOwner } from "./authorize-owner-action";
import { resolveEvalProviderPool } from "./eval-provider-config";
import { submitEvalRun } from "./submit-eval-run";

type Db = PostgresJsDatabase<Record<string, never>>;
type Prompt = NonNullable<Awaited<ReturnType<typeof findPromptByOrgAndName>>>;

const DEFAULT_GATE: EvalGateConfig = { enabled: false, models: [], minPassPct: 100 };

/** Org admin, or the skill's owner (the user, or the owning team's owner). */
async function assertCanManageGate(db: Db, user: UserSummary, prompt: Prompt) {
  if (user.role === "admin") return;
  try {
    await assertAuthorizedForOwner(db, user, prompt.ownerType, prompt.ownerId);
  } catch {
    throw new NotAuthorizedError();
  }
}

function auditFor(
  actor: { organizationId: string; userId: string },
  ctx: AuditContext,
  action: string,
  promptId: string,
  after: Record<string, unknown>,
) {
  return (tx: Db) =>
    record(tx, {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      actorApiKeyId: null,
      action,
      resourceType: "prompt",
      resourceId: promptId,
      before: null,
      after,
      transport: ctx.transport,
      sourceIp: ctx.sourceIp ?? null,
    });
}

export async function getEvalGate(db: Db, organizationId: string, promptName: string) {
  const prompt = await findPromptByOrgAndName(db, organizationId, promptName);
  if (!prompt) throw new PromptNotFoundError(promptName);
  const row = await getGate(db, prompt.id);
  const gate: EvalGateConfig = row ? { enabled: row.enabled, models: row.models, minPassPct: row.minPassPct } : DEFAULT_GATE;
  const versions = await listVersionsByPrompt(db, prompt.id);
  const active = versions.find((v) => v.id === prompt.activeVersionId);
  const candidates = versions
    .filter((v) => active && v.id !== active.id && v.createdAt > active.createdAt)
    .map((v) => v.version);
  return { ...gate, candidates };
}

/**
 * Owner/admin sets the gate. It can only be switched on once the org has opted in to evals, the pool
 * covers the named models, and the active version carries eval cases (Ben #6: off until they exist).
 */
export async function setEvalGate(
  db: Db,
  actingUser: UserSummary,
  promptName: string,
  params: EvalGateConfig,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
) {
  const prompt = await findPromptByOrgAndName(db, actingUser.orgId, promptName);
  if (!prompt) throw new PromptNotFoundError(promptName);
  await assertCanManageGate(db, actingUser, prompt);

  const models = [...new Set(params.models)];
  if (!Number.isInteger(params.minPassPct) || params.minPassPct < 0 || params.minPassPct > 100) {
    throw new EvalGateConfigInvalidError("minPassPct must be a whole number from 0 to 100.");
  }
  if (params.enabled) {
    if (models.length === 0 || models.length > MAX_EVAL_MODELS) {
      throw new EvalGateConfigInvalidError(`Name between 1 and ${MAX_EVAL_MODELS} models for the gate.`);
    }
    if (!(await isEvalsEnabled(db, actingUser.orgId))) throw new EvalsNotEnabledError();
    const pool = await resolveEvalProviderPool(db, actingUser.orgId);
    if (pool.providers.length === 0) throw new EvalPoolNotConfiguredError();
    const missing = models.find((m) => !pool.models.includes(m));
    if (missing) throw new EvalGateConfigInvalidError(`Model "${missing}" is not in the provider pool.`);
    const current = prompt.activeVersionId ? await findVersionById(db, prompt.activeVersionId) : null;
    if (!current?.files.some((f) => f.name === EVAL_CASES_FILE_NAME)) {
      throw new EvalGateConfigInvalidError(`The active version has no ${EVAL_CASES_FILE_NAME}; add eval cases first.`);
    }
  }
  const actor = { organizationId: actingUser.orgId, userId: actingUser.id };
  await withAudit(
    db,
    (tx) => upsertGate(tx, { promptId: prompt.id, organizationId: actor.organizationId, enabled: params.enabled, models, minPassPct: params.minPassPct, updatedBy: actor.userId }),
    auditFor(actor, auditContext, params.enabled ? "eval_gate.enabled" : "eval_gate.disabled", prompt.id, {
      models,
      minPassPct: params.minPassPct,
    }),
  );
  return { enabled: params.enabled, models, minPassPct: params.minPassPct };
}

export type GateState =
  | { state: "evaluating"; runId: string }
  | { state: "blocked"; reason: string };

/** True when publishing should create a candidate instead of activating (gate on, org opted in, a version already serves). */
export async function gateHoldsPublish(db: Db, prompt: Prompt): Promise<EvalGateConfig | null> {
  if (!prompt.activeVersionId) return null;
  const row = await getGate(db, prompt.id);
  if (!row?.enabled || !(await isEvalsEnabled(db, prompt.organizationId))) return null;
  return { enabled: true, models: row.models, minPassPct: row.minPassPct };
}

/**
 * After a candidate is stored, queues its gate run. When that cannot happen (no pool, no cases, model no
 * longer allowed) the candidate stays and the reason is recorded, never silently activating.
 */
export async function submitGateRun(
  db: Db,
  actor: PromptActor,
  prompt: Prompt,
  versionLabel: string,
  gate: EvalGateConfig,
  auditContext: AuditContext,
): Promise<GateState> {
  try {
    const pool = await resolveEvalProviderPool(db, actor.organizationId);
    const run = await submitEvalRun(db, actor, { promptName: prompt.name, version: versionLabel, models: gate.models }, pool, auditContext);
    await auditFor(actor, auditContext, "eval_gate.candidate_created", prompt.id, { version: versionLabel, runId: run.id })(db);
    return { state: "evaluating", runId: run.id };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "The gate run could not be queued.";
    await auditFor(actor, auditContext, "eval_gate.blocked", prompt.id, { version: versionLabel, reason })(db);
    return { state: "blocked", reason };
  }
}

/**
 * Called when a run finishes. If the run's version is a candidate (newer than the active one) of a
 * gated skill, activates it when the run meets the gate, else records why not. Only the run's own
 * content digest is ever considered, since results hang off that exact version.
 */
export async function applyEvalGate(db: Db, organizationId: string, runId: string): Promise<void> {
  const run = await findRunByOrgAndId(db, organizationId, runId);
  if (!run) throw new EvalRunNotFoundError();
  const gateRow = await getGate(db, run.promptId);
  if (!gateRow?.enabled) return;
  const prompt = await findPromptByOrgAndId(db, organizationId, run.promptId);
  if (!prompt || prompt.activeVersionId === run.promptVersionId) return;
  const version = await findVersionById(db, run.promptVersionId);
  const active = prompt.activeVersionId ? await findVersionById(db, prompt.activeVersionId) : null;
  if (!version || (active && version.createdAt <= active.createdAt)) return;

  const results = await listResultsByRun(db, organizationId, runId);
  const verdict = evaluateGate(
    { enabled: true, models: gateRow.models, minPassPct: gateRow.minPassPct },
    { status: run.status, error: run.error, models: run.models, results },
  );
  const actor = { organizationId, userId: run.requestedBy };
  const ctx = DEFAULT_WEB_AUDIT_CONTEXT;
  await withAudit(
    db,
    async (tx) => {
      if (verdict.passed) await updatePrompt(tx, prompt.id, { activeVersionId: version.id });
    },
    async (tx) => {
      const base = { version: version.version, runId, passRates: verdict.passRates };
      if (verdict.passed) {
        await auditFor(actor, ctx, "eval_gate.passed", prompt.id, base)(tx);
        await auditFor(actor, ctx, "prompt.version_activated", prompt.id, { activeVersionId: version.id, via: "eval_gate" })(tx);
      } else {
        await auditFor(actor, ctx, "eval_gate.failed", prompt.id, { ...base, reasons: verdict.reasons })(tx);
      }
    },
  );
}

/** Admin or skill owner activates a candidate despite the gate; the reason is audited. */
export async function activateCandidateVersion(
  db: Db,
  actingUser: UserSummary,
  promptName: string,
  versionLabel: string,
  reason: string,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
) {
  const prompt = await findPromptByOrgAndName(db, actingUser.orgId, promptName);
  if (!prompt) throw new PromptNotFoundError(promptName);
  await assertCanManageGate(db, actingUser, prompt);
  const why = reason.trim();
  if (!why) throw new EvalGateConfigInvalidError("A reason is required to override the gate.");
  const version = await findVersionByPromptAndLabel(db, prompt.id, versionLabel);
  if (!version) throw new PromptVersionNotFoundError(versionLabel);
  if (version.id === prompt.activeVersionId) throw new VersionNotCandidateError(versionLabel);
  const actor = { organizationId: actingUser.orgId, userId: actingUser.id };
  await withAudit(
    db,
    (tx) => updatePrompt(tx, prompt.id, { activeVersionId: version.id }),
    async (tx) => {
      await auditFor(actor, auditContext, "eval_gate.overridden", prompt.id, { version: version.version, reason: why })(tx);
      await auditFor(actor, auditContext, "prompt.version_activated", prompt.id, { activeVersionId: version.id, via: "override" })(tx);
    },
  );
  return { activeVersion: version.version };
}
