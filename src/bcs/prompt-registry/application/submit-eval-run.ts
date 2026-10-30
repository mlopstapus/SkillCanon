import { randomUUID } from "node:crypto";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { DEFAULT_WEB_AUDIT_CONTEXT, record, type AuditContext } from "@/bcs/audit-compliance";
import { withAudit } from "@/shared/db";
import { EVAL_CASES_FILE_NAME, parseEvalCases } from "../domain/eval-cases";
import {
  EvalCasesNotFoundError,
  EvalJudgeRequiredError,
  EvalModelNotAllowedError,
  EvalsNotEnabledError,
  EvalPoolNotConfiguredError,
  InvalidEvalRequestError,
  MAX_EVAL_MODELS,
  type EvalProviderPool,
  type SubmitEvalRunParams,
} from "../domain/eval-run";
import { normalizeVersionLabel, PromptNotFoundError, PromptVersionNotFoundError, type PromptActor } from "../domain/prompt";
import { insertRun, isEvalsEnabled } from "../infrastructure/eval-runs-repo";
import { findPromptByOrgAndName } from "../infrastructure/prompts-repo";
import { findVersionByPromptAndLabel } from "../infrastructure/prompt-versions-repo";
import { versionContentDigest } from "./eval-content-digest";

type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Stores a queued eval run for one skill version (017/003, PDR-020). Rejects,
 * storing nothing, when the org has not opted in, the pool is empty, a model is not in the pool, the
 * version has no valid `evals/cases.yaml`, or a rubric case has no judge.
 * The stored `queued` row is the queue: a separate worker claims and runs it
 * (executeEvalRun). Requires the organization's eval opt-in.
 */
export async function submitEvalRun(
  db: Db,
  actor: PromptActor,
  params: SubmitEvalRunParams,
  pool: EvalProviderPool,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
) {
  if (!(await isEvalsEnabled(db, actor.organizationId))) throw new EvalsNotEnabledError();
  if (pool.providers.length === 0 || pool.models.length === 0) {
    throw new EvalPoolNotConfiguredError();
  }
  const models = [...new Set(params.models)];
  if (models.length === 0 || models.length > MAX_EVAL_MODELS) {
    throw new InvalidEvalRequestError(`Name between 1 and ${MAX_EVAL_MODELS} models.`);
  }
  const judge = params.judge ?? pool.defaultJudge ?? null;
  for (const model of [...models, ...(params.judge ? [params.judge] : [])]) {
    if (!pool.models.includes(model)) throw new EvalModelNotAllowedError(model);
  }

  const prompt = await findPromptByOrgAndName(db, actor.organizationId, params.promptName);
  if (!prompt) throw new PromptNotFoundError(params.promptName);
  const version = await findVersionByPromptAndLabel(db, prompt.id, normalizeVersionLabel(params.version));
  if (!version) throw new PromptVersionNotFoundError(params.version);

  const casesFile = version.files.find((f) => f.name === EVAL_CASES_FILE_NAME);
  if (!casesFile) throw new EvalCasesNotFoundError();
  const cases = parseEvalCases(casesFile.content);
  if (cases.some((c) => c.rubric !== undefined) && !judge) throw new EvalJudgeRequiredError();

  const id = randomUUID();
  const values = {
    id,
    organizationId: actor.organizationId,
    promptId: prompt.id,
    promptVersionId: version.id,
    contentDigest: versionContentDigest(version),
    models,
    judge,
    requestedBy: actor.userId,
  };
  return withAudit(
    db,
    (tx) => insertRun(tx, values),
    (tx) =>
      record(tx, {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        actorApiKeyId: null,
        action: "eval_run.submitted",
        resourceType: "eval_run",
        resourceId: id,
        before: null,
        after: values,
        transport: auditContext.transport,
        sourceIp: auditContext.sourceIp ?? null,
      }),
  );
}
