# Plan 053
- Migration `0042_prompt_registry_eval_worker_queue`: `list_queued_eval_runs(limit)`, `fail_stale_eval_runs(secs)`, SECURITY DEFINER, executable by `skillcanon_app` only.
- `application/eval-worker.ts` `evalWorkerTick`: reap, list, start up to the free slots, resolve the org pool, `executeEvalRun`.
- `scripts/eval-worker.ts` (tsx) is the composition root: poll loop, `withTenantContext` scopes, SIGTERM drain.
- Dockerfile `worker` stage (full node_modules and src) and compose service `eval-worker`.
- Tests on Testcontainers: cross-org pickup with stored providers, concurrency cap, missing provider, stale reaper.
