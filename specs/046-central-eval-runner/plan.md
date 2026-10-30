# Plan: Central Eval Queue and Job Tables (part 1a)
**Spec**: [spec.md](spec.md)

- Migration 0036: `prompt_registry.eval_runs`, `eval_results`, `eval_settings` (org opt-in), RLS (skillcanon_app policy, same shape as 0019).
- Domain `eval-run.ts`: types, errors, limits, `EvalProvider`/`EvalProviderPool` interfaces. `eval-cases.ts` gains `parseEvalCases` (typed) used by the validator and the runner. `eval-scoring.ts`: assertion and rubric scoring (`ajv` for json_schema).
- Application `submit-eval-run.ts`, `get-eval-run.ts`, `execute-eval-run.ts`. The executor takes a `scope(fn)` callback so no application function calls `withTenantContext` itself; it keeps provider calls outside any DB transaction.
- Infrastructure `eval-runs-repo.ts`, `eval-provider-pool.ts` (empty pool; 1c fills it). No in-app queue or scheduler: the `queued` row is the queue and a separate worker (1b) claims it.
- REST: `POST|GET /api/skills/[name]/versions/[version]/evals`, `GET .../evals/[runId]`; errors registered in `src/shared/api/errors.ts`. Adds `GET|PUT /api/evals/settings` (org opt-in, admin only).
- Barrel exports and CONTRACT.md updated. Tests: Testcontainers application tests with a stub provider, route test.
