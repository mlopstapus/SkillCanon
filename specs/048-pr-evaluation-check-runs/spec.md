# Feature Specification: PR Evaluation & GitHub Check Runs

**Branch**: `feat/011-005-pr-evaluation` | **Created**: 2026-10-30 | **Status**: Draft | **Depends on**: 045, 046, 047 (011/001, 002, 004)

**Input**: backlog/011-vcs-integration/005-pr-evaluation-and-github-check-runs.md

## User Scenarios & Testing
### US1 - A PR author sees whether required skills ran (P1)
When a PR on a linked repo is opened, reopened or pushed to, SkillCanon checks which of the project's required skills were run (via the CLI) on the PR's commits and posts a GitHub check run: success if all ran, failure naming the missing ones, neutral with a visible error if the check itself could not run. It is informational and never blocks merging.
**Acceptance**: 1. All required skills ran → success check run. 2. One missing → failure whose summary names it. 3. Another push to the same commit/redelivery updates the same check run and row, never a duplicate; a new head commit gets its own. 4. A failed evaluation → neutral check run with the error, not silence. 5. Repo not linked → nothing happens.
### US2 - Retries are harmless (P1)
A repeated webhook delivery does nothing a second time.
### US3 - History survives (P2)
Evaluations stay readable after a repo is unlinked and are isolated per organization.

## Requirements
- FR-001 Handle `pull_request` opened/synchronize/reopened for linked repos; organization comes only from the stored link, and the payload's installation must be that link's installation.
- FR-002 Required skills come from Prompt Registry; usage from Distribution; matching by skill name on any commit of the PR (name only, any version).
- FR-003 One `PrCheck` per (link, PR, head sha), upserted; check run created once per head and updated thereafter.
- FR-004 Conclusions: pass=success, fail=failure, error=neutral; summary in plain language; never a required check.
- FR-005 Dedup by delivery id; audit event per evaluation; no DELETE of history.
- FR-006 Several links on one repo each get their own check run, named with the project.

## Assumptions
GitHub ties a check run to a commit, so "the same check run" means per head commit (a new push gets a new run). Evaluation is synchronous in the webhook request (PDR-007). Monorepo path scoping is out of scope. Eval results are not shown (no spec dependency).
