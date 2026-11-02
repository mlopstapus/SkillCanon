---
epic: 017-cross-model-evals
feature: 004-results-matrix
status: open
dependencies: [003-skillcanon-eval]
---

# Results Matrix

Per [PDR-020](../../docs/pdr/020-where-evals-run.md), results come from centrally executed runs (003), so the page can also start a run and show its progress.

## Requirements

- [x] An "Evals" tab on the skill page: a version × model matrix of pass rate, with the previous version beside the active one and regressions highlighted. Cells are keyed by version and model; a comparison is only drawn between two results for the same content digest, otherwise both digests are shown side by side with no computed delta.
- [x] Each cell drills down to per-case results (input, assertion outcomes or rubric score, latency, tokens, error).
- [x] An authorised user can start a run for a version from the tab (choosing models from the provider pool) and sees queued/running/failed state; the matrix refreshes when the run finishes. With no pool configured, the tab says evals are not configured and offers no run control.
- [x] A version with no `evals/cases.yaml` shows an empty state explaining how to add one.

## Acceptance Criteria

- [x] A skill with two versions and results for both shows both rows with regressions highlighted (unit and markup tests).
- [ ] A run started from the tab appears as running, then as results. Built and covered by markup tests for the running state; the live check needs a real provider in the pool and the org opted in, **needs Ben**.
- [x] Pool unconfigured, evals-off and no-cases states render without errors (unit tests; e2e for the unconfigured state).

## Decisions (Ben, 2026-10-30)

- Regression tolerance: **none**; any drop in pass rate versus the previous version's same-model result is a regression.
- Who can start a run: **editors and reviewers**. No reviewer role exists yet (see 003); until it does, any org member with access to the skill.

## Dependencies

- 003 central eval runner and results API.
