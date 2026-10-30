import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { DEFAULT_WEB_AUDIT_CONTEXT, record } from "@/bcs/audit-compliance";
import { withAudit } from "@/shared/db";
import { EVAL_CASES_FILE_NAME, parseEvalCases } from "../domain/eval-cases";
import {
  DEFAULT_EVAL_LIMITS,
  RUBRIC_PASS_SCORE,
  type EvalLimits,
  type EvalProviderPool,
} from "../domain/eval-run";
import { judgePrompt, parseJudgeScore, scoreAssertions } from "../domain/eval-scoring";
import {
  claimRun,
  finishRun,
  insertResults,
  type InsertEvalResultParams,
} from "../infrastructure/eval-runs-repo";
import { findPromptByOrgAndId } from "../infrastructure/prompts-repo";
import { findVersionById } from "../infrastructure/prompt-versions-repo";
import { expand } from "./expand";

type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Runs short DB work. The composition root supplies it (a `withTenantContext`
 * wrapper) so this application code never opens a tenant context itself and
 * never holds a transaction open across slow provider calls.
 */
export type EvalScope = <T>(fn: (tx: Db) => Promise<T>) => Promise<T>;

function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Timed out waiting for the provider.")), Math.max(ms, 1));
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Executes one queued eval run (017/003, PDR-020): expands the version through
 * governed `expand()` as the requesting user, runs each case on each model,
 * scores asserts locally and rubrics with the judge. A provider error is
 * recorded on its own row; exceeding the time or token cap fails the run and
 * keeps the partial results. A run already claimed is a no-op.
 */
export async function executeEvalRun(
  scope: EvalScope,
  organizationId: string,
  runId: string,
  pool: EvalProviderPool,
  limits: EvalLimits = DEFAULT_EVAL_LIMITS,
): Promise<void> {
  const fail = (message: string) => scope((tx) => finishRun(tx, organizationId, runId, "failed", message));

  const prepared = await scope(async (tx) => {
    const run = await claimRun(tx, organizationId, runId);
    if (!run) return null;
    try {
      const prompt = await findPromptByOrgAndId(tx, organizationId, run.promptId);
      const version = await findVersionById(tx, run.promptVersionId);
      const casesFile = version?.files.find((f) => f.name === EVAL_CASES_FILE_NAME);
      if (!prompt || !version || !casesFile) throw new Error("The version or its cases file no longer exists.");
      const expanded = await expand(tx, {
        organizationId,
        promptName: prompt.name,
        userId: run.requestedBy,
        version: version.version,
      });
      return { run, system: expanded.content, cases: parseEvalCases(casesFile.content) };
    } catch (err) {
      return { run, error: err instanceof Error ? err.message : "Could not prepare the run." };
    }
  });
  if (!prepared) return;
  if ("error" in prepared) {
    await fail(prepared.error!);
    return;
  }

  const { run, system, cases } = prepared;
  const startedAt = Date.now();
  let tokens = 0;
  let stopReason: string | null = null;
  const rows: InsertEvalResultParams[] = [];

  const call = async (modelId: string, sys: string, user: string) => {
    const slash = modelId.indexOf("/");
    const provider = pool.providers.find((p) => p.id === modelId.slice(0, slash));
    if (!provider) throw new Error(`No provider for model "${modelId}".`);
    const completion = await withDeadline(
      provider.complete({ model: modelId.slice(slash + 1), system: sys, user }),
      limits.maxJobMs - (Date.now() - startedAt),
    );
    tokens += completion.tokens;
    return completion;
  };

  outer: for (const model of run.models) {
    for (const c of cases) {
      if (Date.now() - startedAt > limits.maxJobMs) {
        stopReason = "The run exceeded its time limit.";
        break outer;
      }
      if (tokens > limits.maxJobTokens) {
        stopReason = "The run exceeded its token limit.";
        break outer;
      }
      const base = { organizationId, runId, model, caseId: c.id };
      const t0 = Date.now();
      try {
        const answer = await call(model, system, c.input);
        const latencyMs = Date.now() - t0;
        if (c.assert) {
          const { passed, scorePct } = scoreAssertions(c.assert, answer.text);
          rows.push({ ...base, passed, scorePct, latencyMs, tokens: answer.tokens, error: null });
        } else {
          const judge = judgePrompt(c.rubric!, c.input, answer.text);
          const verdict = await call(run.judge!, judge.system, judge.user);
          const score = parseJudgeScore(verdict.text);
          if (score === null) throw new Error("The judge returned no usable score.");
          rows.push({
            ...base,
            passed: score >= RUBRIC_PASS_SCORE,
            scorePct: Math.round(score * 100),
            latencyMs,
            tokens: answer.tokens + verdict.tokens,
            error: null,
          });
        }
      } catch (err) {
        rows.push({
          ...base,
          passed: false,
          scorePct: null,
          latencyMs: Date.now() - t0,
          tokens: null,
          error: err instanceof Error ? err.message : "Provider error.",
        });
      }
    }
  }

  await scope((tx) =>
    withAudit(
      tx,
      async (inner) => {
        await insertResults(inner, rows);
        await finishRun(inner, organizationId, runId, stopReason ? "failed" : "succeeded", stopReason);
      },
      (inner) =>
        record(inner, {
          organizationId,
          actorUserId: run.requestedBy,
          actorApiKeyId: null,
          action: "eval_run.completed",
          resourceType: "eval_run",
          resourceId: runId,
          before: null,
          after: { status: stopReason ? "failed" : "succeeded", results: rows.length, tokens },
          transport: DEFAULT_WEB_AUDIT_CONTEXT.transport,
          sourceIp: null,
        }),
    ),
  );
}
