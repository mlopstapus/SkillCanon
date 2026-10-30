# Feature Specification: VCS Integration Dashboard UI

**Branch**: `feat/011-006-dashboard` | **Created**: 2026-10-30 | **Depends on**: 011/001, 002, 004, 005 | **Input**: backlog/011-vcs-integration/006

## User Scenarios & Testing
### US1 - See how a project's PRs are doing (P1)
On a project's GitHub checks page, a member sees the linked repositories, a compliance rate for the last 30 days, and each recently evaluated PR with pass/fail/could-not-evaluate and the ran/missing skill names, matching the GitHub check run.
### US2 - Sensible empty states (P1)
No installation, installation but no linked repos, linked repos but no PRs, and PRs only outside the window each render a clear message with the next step.
### US3 - Connected area (P2)
The page links to GitHub settings (install/link) and the settings page links to each project's checks; who ran which skills stays on the project's Metrics tab.

## Requirements
- FR-001 `getComplianceSummaryForProject(db, orgId, projectId, { since })` returns totals and `rate = passed/(passed+failed)`; neutral counts in the total but not in the rate; null rate when nothing to rate.
- FR-002 `listRecentPrChecksForProject` returns the latest evaluation per PR across all repos ever linked to the project (history survives unlinking), newest first, org-scoped.
- FR-003 Page `/projects/[id]/checks` uses the shared app shell and design tokens; visibility only, never a gate.
- FR-004 Per-user usage is provided by the existing project Metrics tab (member-level run counts) and linked from the page.

## Success Criteria
SC-001 The rate shown equals a manual pass/(pass+fail) count of the project's checks in the window. SC-002 All four empty states render. SC-003 Another organization's checks never appear.

## Assumptions
30-day window. Accessibility is provisional until the epic 010 cross-page pass. Needs Ben's live App to see real PR data.
