/**
 * Domain types, errors and limits for central eval runs (017/003, PDR-020).
 * Evals run on the main service against an operator-configured provider
 * pool; the CLI only submits runs and reads results.
 */

export type EvalRunStatus = "queued" | "running" | "succeeded" | "failed";

/** Rubric cases pass at or above this judge score (0..1). */
export const RUBRIC_PASS_SCORE = 0.7;
export const MAX_EVAL_MODELS = 10;

/** Runner limits (PDR-020; concurrency 4 per Ben). Enforced by the worker. */
export interface EvalLimits {
  maxConcurrentJobs: number;
  maxJobMs: number;
  maxJobTokens: number;
}
export const DEFAULT_EVAL_LIMITS: EvalLimits = {
  maxConcurrentJobs: 4,
  maxJobMs: 10 * 60_000,
  maxJobTokens: 200_000,
};

export interface EvalCompletion {
  text: string;
  tokens: number;
}

/** One provider in the pool. Credentials live inside it, never in this layer's data. */
export interface EvalProvider {
  /** e.g. `anthropic`; model ids are `<id>/<model>`. */
  id: string;
  complete(params: { model: string; system: string; user: string }): Promise<EvalCompletion>;
}

export interface EvalProviderPool {
  providers: EvalProvider[];
  /** Allowed model ids (`<provider>/<model>`). */
  models: string[];
  defaultJudge?: string;
}

export interface SubmitEvalRunParams {
  promptName: string;
  version: string;
  models: string[];
  judge?: string;
}

export interface EvalRunSummary {
  id: string;
  promptId: string;
  promptVersionId: string;
  contentDigest: string;
  models: string[];
  judge: string | null;
  status: EvalRunStatus;
  error: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export interface EvalResultSummary {
  model: string;
  caseId: string;
  passed: boolean;
  /** 0..100, null when the case errored. */
  scorePct: number | null;
  latencyMs: number | null;
  tokens: number | null;
  error: string | null;
}

export class EvalPoolNotConfiguredError extends Error {
  constructor() {
    super("Evals are not configured: no provider pool is set up on this instance.");
    this.name = "EvalPoolNotConfiguredError";
  }
}

export class EvalModelNotAllowedError extends Error {
  constructor(model: string) {
    super(`Model "${model}" is not in this instance's provider pool.`);
    this.name = "EvalModelNotAllowedError";
  }
}

export class EvalCasesNotFoundError extends Error {
  constructor() {
    super("This version has no evals/cases.yaml, so there is nothing to evaluate.");
    this.name = "EvalCasesNotFoundError";
  }
}

export class EvalJudgeRequiredError extends Error {
  constructor() {
    super("This version has rubric cases; name a judge model or configure a default judge.");
    this.name = "EvalJudgeRequiredError";
  }
}

export class InvalidEvalRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidEvalRequestError";
  }
}

export class EvalRunNotFoundError extends Error {
  constructor() {
    super("Eval run not found.");
    this.name = "EvalRunNotFoundError";
  }
}

export class EvalsNotEnabledError extends Error {
  constructor() {
    super("Evals are not enabled for this organization. An admin must opt in, which also allows skill content to be sent to the configured model providers.");
    this.name = "EvalsNotEnabledError";
  }
}
