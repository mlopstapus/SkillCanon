/** Pure model of the skill page's Evals tab (017/004): a version × model matrix with regressions. */

export interface EvalCaseView {
  id: string;
  input: string;
}

export interface EvalResultView {
  model: string;
  caseId: string;
  passed: boolean;
  scorePct: number | null;
  latencyMs: number | null;
  tokens: number | null;
  error: string | null;
}

export interface EvalRunView {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  contentDigest: string;
  models: string[];
  error: string | null;
  /** Present only for a finished run. */
  results: EvalResultView[];
}

export interface EvalVersionInput {
  versionId: string;
  version: string;
  isActive: boolean;
  hasCases: boolean;
  cases: EvalCaseView[];
  /** Newest first. */
  runs: EvalRunView[];
}

export interface EvalCell {
  model: string;
  passed: number;
  total: number;
  /** Whole percent, 0..100. */
  passRate: number;
  digest: string;
  results: EvalResultView[];
  /** Pass rate minus the previous version's for the same model; null when no like-for-like previous result. */
  delta: number | null;
  regression: boolean;
}

export interface EvalMatrixRow {
  versionId: string;
  version: string;
  isActive: boolean;
  hasCases: boolean;
  cases: EvalCaseView[];
  cells: Record<string, EvalCell>;
  /** The newest run that is still queued or running, else null. */
  activeRun: { id: string; status: "queued" | "running" } | null;
  /** The newest failed run's error when there is no result at all for the row. */
  lastError: string | null;
}

export interface EvalMatrix {
  models: string[];
  /** Newest version first. */
  rows: EvalMatrixRow[];
}

function cellFor(model: string, runs: EvalRunView[]): Omit<EvalCell, "delta" | "regression"> | null {
  for (const run of runs) {
    if (run.status !== "succeeded") continue;
    const results = run.results.filter((r) => r.model === model);
    if (results.length === 0) continue;
    const passed = results.filter((r) => r.passed).length;
    return {
      model,
      passed,
      total: results.length,
      passRate: Math.round((passed / results.length) * 100),
      digest: run.contentDigest,
      results,
    };
  }
  return null;
}

/**
 * `versions` oldest first. A cell uses the newest finished run that covers its
 * model. Any drop in pass rate versus the previous version's result for the
 * same model is a regression (no tolerance, Ben 2026-10-30); a comparison is
 * drawn only when both cells ran the same number of cases, otherwise both
 * rates show with no delta.
 */
export function buildEvalMatrix(versions: EvalVersionInput[], poolModels: string[]): EvalMatrix {
  const modelSet = new Set(poolModels);
  const rows: EvalMatrixRow[] = [];
  const previous = new Map<string, EvalCell>();

  for (const v of versions) {
    const cells: Record<string, EvalCell> = {};
    const models = new Set([...poolModels, ...v.runs.flatMap((r) => r.models)]);
    for (const model of models) {
      const base = cellFor(model, v.runs);
      if (!base) continue;
      modelSet.add(model);
      const prev = previous.get(model);
      const comparable = prev !== undefined && prev.total === base.total;
      const delta = comparable ? base.passRate - prev.passRate : null;
      cells[model] = { ...base, delta, regression: delta !== null && delta < 0 };
      previous.set(model, cells[model]);
    }
    const active = v.runs.find((r) => r.status === "queued" || r.status === "running");
    const failed = v.runs.find((r) => r.status === "failed");
    rows.push({
      versionId: v.versionId,
      version: v.version,
      isActive: v.isActive,
      hasCases: v.hasCases,
      cases: v.cases,
      cells,
      activeRun: active ? { id: active.id, status: active.status as "queued" | "running" } : null,
      lastError: Object.keys(cells).length === 0 && failed ? (failed.error ?? "The run failed.") : null,
    });
  }

  return { models: [...modelSet].sort(), rows: rows.reverse() };
}
