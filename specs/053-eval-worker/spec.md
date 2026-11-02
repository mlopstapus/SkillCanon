# Spec 053: Eval worker process (017/003 part 1b)

Backlog: `backlog/017-cross-model-evals/003-skillcanon-eval.md` part 1b. Governs: PDR-020, Ben's answers #1697 (3: separate worker with a queue; 4: 4 concurrent jobs, 10 min and 200k tokens per run). Stacked on 052 (provider pool).

## Requirements
- FR-1 A worker runs as its own process (`pnpm eval-worker`, compose service `eval-worker`), not inside the web app.
- FR-2 The queue is the `queued` rows of `prompt_registry.eval_runs`. The worker lists them across orgs through one SECURITY DEFINER function (migration 0042); everything else runs per org under `withTenantContext`.
- FR-3 At most `maxConcurrentJobs` (4) runs execute per process; more workers may share the queue because claiming is atomic.
- FR-4 A run whose org has no provider fails with a clear error. A crashed run is marked failed.
- FR-5 A run left `running` by a dead worker is failed after twice the job time cap.
- FR-6 Shutdown on SIGTERM drains in-flight runs.

## Out of scope
Part 2 CLI; results matrix and gate (017/004, 017/005). Stale-run failures are not audited.
