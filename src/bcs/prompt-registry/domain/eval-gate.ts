/** Eval gate on activation (017/005, PDR-020). */

export interface EvalGateConfig {
  enabled: boolean;
  /** `<provider>/<model>` ids that must each be evaluated. */
  models: string[];
  /** 0..100 minimum pass rate per model. 100 means no regression tolerance. */
  minPassPct: number;
}

export interface GateRunInput {
  status: "queued" | "running" | "succeeded" | "failed";
  error: string | null;
  models: string[];
  results: { model: string; passed: boolean }[];
}

export interface GateVerdict {
  passed: boolean;
  reasons: string[];
  passRates: Record<string, number>;
}

/**
 * Decides a candidate from one run on its own content digest. Every gate model must appear in the
 * run and meet `minPassPct`; an errored case counts as a failure. A failed run never passes.
 */
export function evaluateGate(gate: EvalGateConfig, run: GateRunInput): GateVerdict {
  const reasons: string[] = [];
  const passRates: Record<string, number> = {};
  if (run.status !== "succeeded") {
    reasons.push(run.error ?? "The eval run did not complete.");
    return { passed: false, reasons, passRates };
  }
  for (const model of gate.models) {
    const rows = run.results.filter((r) => r.model === model);
    if (!run.models.includes(model) || rows.length === 0) {
      reasons.push(`${model} was not evaluated.`);
      continue;
    }
    const pct = Math.round((rows.filter((r) => r.passed).length / rows.length) * 100);
    passRates[model] = pct;
    if (pct < gate.minPassPct) reasons.push(`${model} passed ${pct}%, below the required ${gate.minPassPct}%.`);
  }
  return { passed: reasons.length === 0, reasons, passRates };
}

export class VersionNotCandidateError extends Error {
  constructor(version: string) {
    super(`Version "${version}" is already the active version.`);
    this.name = "VersionNotCandidateError";
  }
}

export class EvalGateConfigInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvalGateConfigInvalidError";
  }
}
