---
epic: 017-cross-model-evals
feature: 003-skillcanon-eval
status: open
dependencies: [002-eval-case-format]
---

# Central Eval Runner and `skillcanon eval`

Rewritten for [PDR-020](../../docs/pdr/020-where-evals-run.md) (D4): evals run **centrally**. The main service (or runners it manages) executes eval jobs against a provider pool the operator configures. The CLI never calls a model and users bring no keys; the CLI only submits a run and fetches its results.

## Requirements

Delivered in parts so each PR stays reviewable: **1a** job tables, queue semantics, submit/read API, org opt-in (this PR); **1b** the separate worker process; **1c** admin page for the provider pool and the Anthropic and OpenAI providers; **2** CLI and API-key scope.

**Part 1: queue, job storage, worker**
- [x] An eval run is a stored job for one skill version: `{id, skillVersionId, contentDigest, models[], status: queued|running|succeeded|failed, requestedBy, createdAt, finishedAt}`, with one result row per case × model: `{runId, model, caseId, passed, score, latencyMs, tokens, error?}`. Model ids are `<provider>/<model-id>` (PDR-020). (#109)
- [x] `POST /api/skills/{name}/versions/{version}/evals` submits a run (body: `models`, optional `judge`) and returns the run id immediately; `GET .../evals/{runId}` returns status and results. The server rejects a model that is not in the provider pool with a 422, and a version with no valid `evals/cases.yaml` with a 422. (#109)
- [x] A runner executes queued jobs: it expands the version through the governed `expand()` path, runs each case on each model, scores deterministic `assert` checks locally and `rubric` cases with the judge model, and stores results. It enforces limits: concurrent jobs (4), per-job time cap, per-job token cap. A failing case or provider error is recorded on its row and does not fail the whole run. (#109)
- [x] Results are stored against the version's content digest (016/001) and are never compared across different digests. (#109)

**Part 2: provider pool admin page and CLI**
- [ ] An admin configures the provider pool on an admin page (Anthropic and OpenAI; credentials, allowed models, default judge). Credentials are server-side secrets, never returned by any API, never logged. With no pool configured, submitting a run returns a clear 409 and the UI says evals are not configured.
- [ ] `skillcanon eval <slug> [--version N] --models <provider/model,...> [--judge <provider/model>] [--wait]` submits a run, optionally polls to completion, and prints the pass rate per model. It reads no provider environment variables and sends no keys.
- [x] An org must opt in to evals (admin action, audited) before any run is accepted; this is also consent to send skill content to the providers. (#109)
- [ ] Submitting and reading runs is audited and limited by an API-key scope.

Part 1a shipped in `specs/046-central-eval-runner/` (migration 0036, `executeEvalRun`, REST submit/read, org opt-in; default pool empty so submit is 409). The worker (1b), pool admin page (1c) and CLI (2) remain; this file stays open.

## Acceptance Criteria

- A run submitted for a valid version reaches `succeeded` with one result per case × model against a stub provider in tests.
- A model outside the pool, a version without a valid cases file, or an unconfigured pool each fail with a distinct, documented error.
- The CLI has no code path that reads a provider key.

## Decisions (Ben, 2026-10-30)

1. Provider pool is configured on an **admin page** (not env/config).
2. Providers: **Anthropic and OpenAI** from the start.
3. Runner is a **separate worker process** with a **queue** between the app and the worker. The app only stores a queued job; the worker claims and runs it.
4. Limits: **4 concurrent jobs**, 10 minutes and 200k tokens per run.
5. Third-party data send is a **per-org opt-in**; opting in to evals is that opt-in.
10. **Editors and reviewers** may start runs. Only `admin` and `member` roles exist today, so there is no reviewer role yet; until one is added, any org member with access to the skill may start a run. Smallest way to add reviewers: add `reviewer` to the user role enum and allow it to start runs and read results but not publish.

## Dependencies

- 002 eval case format; PDR-020; 016/001 content digest.
- Needs a migration (job and result tables): coordinate numbering with other lanes' migrations.
