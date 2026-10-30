# Feature Specification: Eval Results Matrix

**Feature**: `053-eval-results-matrix` · **Backlog**: `backlog/017-cross-model-evals/004-results-matrix.md`. Reads lane H's eval tables only through the prompt-registry barrel (`listEvalRuns`, `getEvalRun`, `submitEvalRun`, `getEvalProviderPool`); no table or migration change.

## User Scenarios
- **US1** A skill's page has an **Evals** tab (template skills). It shows a version × model grid of pass rate, newest version first, with any drop versus the previous version's same-model result highlighted (no tolerance).
- **US2** Clicking a cell lists its cases: pass/fail/error, score, latency, tokens, the case input and any error.
- **US3** A member with access starts a run for a version (choosing pool models); the row shows Queued/Running, the tab refreshes itself every 4 s while a run is active, and results appear when it finishes.
- **US4** No provider pool: "Evals are not configured…", no run control. Org not opted in: "Evals are off…". No version with `evals/cases.yaml`: an empty state explaining how to add one.

## Requirements
- **FR-001** A cell is the newest finished run's results for that model; its pass rate is passed/total.
- **FR-002** A delta and regression flag are drawn only when the previous version's cell for the same model ran the same number of cases; otherwise both rates show with no delta.
- **FR-003** The drill-down shows the run's content digest (first 12 characters).
- **FR-004** Starting a run uses `submitEvalRun` with the instance pool; its own rules (opt-in, pool, cases, models) apply and its error is shown.
- **FR-005** The tab shows the latest 8 versions.

## Assumptions
"Same content digest" is read as: results are keyed by the run's digest and shown in the drill-down; version-to-version deltas need the same case count rather than the same digest, since two different versions never share a digest. Any org member with access can start a run until a reviewer role exists.
