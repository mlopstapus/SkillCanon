# Feature Specification: Central Eval Queue and Job Tables (017/003 part 1a)

**Feature Branch**: `feat/017-003-eval-runner`
**Created**: 2026-10-30
**Status**: Draft
**Input**: backlog 017/003 part 1a, built to Ben's answers (#1697): stored eval runs and results where the `queued` row is the queue, an `executeEvalRun` function the separate worker (part 1b) will call, REST submit/read, and a per-org opt-in. The worker process, the admin-page provider pool (Anthropic and OpenAI) and the CLI are later parts.

## User Scenarios & Testing

### User Story 1 - Submit an eval run (P1)
A skill editor submits a run for a skill version naming models; the service stores a queued job and returns its id at once; a separate worker (part 1b) runs it. The org must have opted in to evals (an admin action that also consents to sending skill content to providers).
1. **Given** a version with a valid `evals/cases.yaml` and models in the provider pool, **When** submitting, **Then** a run is stored as queued and runs in the background.
2. **Given** a model outside the pool, a version without a valid cases file, a rubric case with no judge, an org that has not opted in (409), or no pool configured, **Then** submission fails with a distinct 422 (409 for no pool) and stores nothing.

### User Story 2 - Read run results (P1)
The submitter reads the run: status and one result row per case × model (passed, score, latency, tokens, error).

### User Story 3 - Runner executes safely (P1)
The runner expands the version through governed `expand()`, runs each case on each model, scores `assert` checks locally and `rubric` cases through the judge. A provider error on one case is recorded on that row only; exceeding the job's time or token cap ends the run as failed, keeping partial results.

### Edge Cases
- Results are stored against the version's content digest and never compared across digests.
- A run claimed twice executes once.
- Chain-kind versions have no cases file and cannot be evaluated.

## Requirements
- **FR-001**: Runs and results are stored per tenant with row-level isolation.
- **FR-002**: Models are `<provider>/<model-id>` and must be in the pool.
- **FR-003**: Submission validates cases file, models, judge before storing.
- **FR-004**: Runner limits: concurrent jobs, per-job time cap, per-job token cap (defaults 4, 10 min, 200k).
- **FR-005**: Submitting and completing a run are audit events.
- **FR-006**: No provider credential is stored, returned or logged by this feature.

## Success Criteria
- A run against a stub provider reaches `succeeded` with one result per case × model.
- Each rejection path returns its documented, distinct error.

## Assumptions
- Pool configuration (admin page), the worker and the CLI are later parts; until then the default pool is empty and submit returns 409, and nothing executes queued runs.
- Who may start a run: any org member with access to the skill. Ben wants editors and reviewers; only admin/member roles exist, so a reviewer role is a separate item.
- Rubric passes at score >= 0.7.
