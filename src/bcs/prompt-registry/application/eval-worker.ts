import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { DEFAULT_EVAL_LIMITS, type EvalLimits } from "../domain/eval-run";
import { failStaleRuns, finishRun, listQueuedRuns } from "../infrastructure/eval-runs-repo";
import { resolveEvalProviderPool } from "./eval-provider-config";
import { executeEvalRun, type EvalScope } from "./execute-eval-run";

type Db = PostgresJsDatabase<Record<string, never>>;

export interface EvalWorkerDeps {
  /** Plain (no tenant context) connection; only the cross-org queue functions run on it. */
  db: Db;
  /** Tenant-scoped scope for one org, supplied by the composition root (`withTenantContext`). */
  scopeFor: (organizationId: string) => EvalScope;
  /** Run ids currently executing in this process; persists across ticks. */
  inFlight: Set<string>;
  limits?: EvalLimits;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
}

/**
 * One poll of the queue (017/003 1b): fails runs whose worker died, then starts as many queued runs as
 * the concurrency limit allows. Claiming is atomic in `executeEvalRun`, so several workers may share
 * one queue. Returns the started executions so callers (and tests) can await them.
 */
export async function evalWorkerTick(d: EvalWorkerDeps): Promise<Promise<void>[]> {
  const limits = d.limits ?? DEFAULT_EVAL_LIMITS;
  const log = d.log ?? (() => {});
  const stale = await failStaleRuns(d.db, Math.ceil((limits.maxJobMs * 2) / 1000));
  if (stale > 0) log("failed stale runs", { count: stale });

  const free = limits.maxConcurrentJobs - d.inFlight.size;
  if (free <= 0) return [];
  // Over-fetch: runs already in flight are still `running`, not `queued`, but a just-claimed one may race the list.
  const queued = (await listQueuedRuns(d.db, free)).filter((r) => !d.inFlight.has(r.id));

  return queued.map((run) => {
    d.inFlight.add(run.id);
    const scope = d.scopeFor(run.organizationId);
    return (async () => {
      try {
        const pool = await scope((tx) => resolveEvalProviderPool(tx, run.organizationId));
        if (pool.providers.length === 0) {
          await scope((tx) => finishRun(tx, run.organizationId, run.id, "failed", "No model provider is configured for this organization."));
          return;
        }
        await executeEvalRun(scope, run.organizationId, run.id, pool, limits);
      } catch (err) {
        log("run crashed", { runId: run.id, error: err instanceof Error ? err.message : String(err) });
        await scope((tx) =>
          finishRun(tx, run.organizationId, run.id, "failed", "The worker hit an unexpected error."),
        ).catch(() => {});
      } finally {
        d.inFlight.delete(run.id);
      }
    })();
  });
}
