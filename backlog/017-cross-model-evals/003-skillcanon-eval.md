---
epic: 017-cross-model-evals
feature: 003-skillcanon-eval
status: open
dependencies: [002-eval-case-format]
---

# Central Eval Runner and `skillcanon eval`

Rewritten for [PDR-020](../../docs/pdr/020-where-evals-run.md) (D4): evals run **centrally**. The main service (or runners it manages) executes eval jobs against a provider pool the operator configures. The CLI never calls a model and users bring no keys; the CLI only submits a run and fetches its results.

## Requirements

Delivered in two parts so each PR stays reviewable.

**Part 1: runner and job storage**
- [ ] An eval run is a stored job for one skill version: `{id, skillVersionId, contentDigest, models[], status: queued|running|succeeded|failed, requestedBy, createdAt, finishedAt}`, with one result row per case × model: `{runId, model, caseId, passed, score, latencyMs, tokens, error?}`. Model ids are `<provider>/<model-id>` (PDR-020).
- [ ] `POST /api/skills/{name}/versions/{version}/evals` submits a run (body: `models`, optional `judge`) and returns the run id immediately; `GET .../evals/{runId}` returns status and results. The server rejects a model that is not in the provider pool with a 422, and a version with no valid `evals/cases.yaml` with a 422.
- [ ] A runner executes queued jobs: it expands the version through the governed `expand()` path, runs each case on each model, scores deterministic `assert` checks locally and `rubric` cases with the judge model, and stores results. It enforces limits: concurrent jobs, per-job time cap, per-job token cap. A failing case or provider error is recorded on its row and does not fail the whole run.
- [ ] Results are stored against the version's content digest (016/001) and are never compared across different digests.

**Part 2: provider pool and CLI**
- [ ] The operator configures the provider pool (providers, credentials, allowed models, default judge). Credentials are server-side secrets, never returned by any API, never logged. With no pool configured, submitting a run returns a clear 409 and the UI says evals are not configured.
- [ ] `skillcanon eval <slug> [--version N] --models <provider/model,...> [--judge <provider/model>] [--wait]` submits a run, optionally polls to completion, and prints the pass rate per model. It reads no provider environment variables and sends no keys.
- [ ] Submitting and reading runs is audited and limited by an API-key scope.

## Acceptance Criteria

- A run submitted for a valid version reaches `succeeded` with one result per case × model against a stub provider in tests.
- A model outside the pool, a version without a valid cases file, or an unconfigured pool each fail with a distinct, documented error.
- The CLI has no code path that reads a provider key.

## Open Questions (for Ben)

- Where does the operator configure the pool: instance environment/config file (proposed default, simplest, no UI) or an admin settings page?
- Which providers first? Proposed default: Anthropic only, with the pool interface kept provider-agnostic.
- Runner placement: in the Next.js app process (proposed default, simplest for self-host) or a separate worker container?
- Default limits (proposed: 2 concurrent jobs, 10 minutes and 200k tokens per job)?
- Eval inputs (skill content and case data) go to third-party providers: is that acceptable for every org by default, or is a per-org opt-in needed?

## Dependencies

- 002 eval case format; PDR-020; 016/001 content digest.
- Needs a migration (job and result tables): coordinate numbering with other lanes' migrations.
