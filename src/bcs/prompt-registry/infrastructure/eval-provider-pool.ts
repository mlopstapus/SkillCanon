import type { EvalProviderPool } from "../domain/eval-run";

let override: EvalProviderPool | null = null;

/**
 * The operator's provider pool (PDR-020). Part 1 ships no configuration
 * source, so the default pool is empty and submitting a run is a 409; part 2
 * reads the pool from instance config. `setEvalProviderPool` is that hook
 * and the test seam.
 */
export function getEvalProviderPool(): EvalProviderPool {
  return override ?? { providers: [], models: [] };
}

export function setEvalProviderPool(pool: EvalProviderPool | null) {
  override = pool;
}
