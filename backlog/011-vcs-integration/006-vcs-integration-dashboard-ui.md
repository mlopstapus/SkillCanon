---
epic: 011-vcs-integration
feature: 006-vcs-integration-dashboard-ui
status: open
dependencies: ["005-pr-evaluation-and-github-check-runs"]
---

# VCS Integration Dashboard UI

A real, finished-design page (per this backlog's standing pattern — no placeholder-then-redesign step) showing PR check history and repo links, embedded in the app shell.

## Requirements

- [ ] A per-project view (`src/app/(app)/projects/*/checks`) lists linked repos and, per repo, recent PRs with their latest `PrCheck` status (pass/fail/neutral) and which skills were satisfied/missing.
- [ ] The same per-project view shows a **compliance-rate summary** above the per-PR list (e.g. "87% of the last 30 evaluated PRs passed") — the aggregate counterpart to the per-PR pass/fail/neutral list, backed by a new `getComplianceSummaryForProject` read (see Technical Notes). Explicitly visibility-only, matching `005`'s own non-blocking decision — this is a reporting metric, not a merge gate.
- [ ] A per-user usage view (or a filter on an existing usage view) shows which skills a given user has invoked recently — the "skills used by each user" half of the original ask, which needs no new backend beyond what Distribution's existing `PromptUsage` (now with an actor) already has.
- [ ] The GitHub App installation/repo-linking management UI from feature 002 is reachable from this same settings area, not a separate disconnected page.
- [ ] Empty states: no installation yet ("Install SkillCanon on GitHub" CTA), installation but no linked repos, linked repo but no PRs evaluated yet, linked repo with PRs evaluated but zero still within the compliance-rate window.
- [ ] Uses the shared design system (`src/shared/ui/`) and app shell composition already established in `004-app-shell-and-landing`, not a one-off layout.

## Acceptance Criteria

- [ ] A project with a linked repo and at least one evaluated PR shows correct pass/fail/neutral status and the specific missing skill names, matching what the GitHub Check Run itself reports.
- [ ] The compliance-rate summary's percentage matches a manual count of `pass` vs. total evaluated `PrCheck` rows across every repo linked to the project, within whatever window `getComplianceSummaryForProject` is called with.
- [ ] `neutral` (evaluation-errored) checks are excluded from the rate's denominator, not counted as failures — an infra error isn't the same claim as "a required skill was missing."
- [ ] All four empty states render sensibly rather than a blank or broken page.
- [ ] Page passes the same accessibility bar as other already-shipped pages (this is provisional now; the epic 010 cross-page pass will verify formally later, per its own Dependencies list).

## Open Questions

None.

## Dependencies

- `backlog/011-vcs-integration/005-pr-evaluation-and-github-check-runs.md` (needs real `PrCheck` data to render)
- `backlog/004-app-shell-and-landing/002-app-shell-and-navigation.md` (page shell to embed into)

## Technical Notes

- Per `repo-structure.md`, this page is authored here (VCS Integration's `OWNERSHIP.md`) but embedded in Distribution's `src/app/(app)/` composition — same pattern every other BC's UI feature already follows.
- This page is explicitly in scope for `010-ui-polish-and-accessibility`'s later cross-page consistency pass (already added as a dependency there) — build it to the current design-system standard now rather than treating polish as someone else's future problem.
- **Added 2026-07-30**: `getComplianceSummaryForProject(orgId, projectId, { since? })` is a new exposed API (see `CONTRACT.md`), aggregating `PrCheck` rows across every repo linked to the project into `{ totalEvaluated, passed, failed, neutral, rate }`. `neutral` rows count toward `totalEvaluated` but are excluded from `rate`'s numerator/denominator — an evaluation error is not the same signal as a missing skill, and folding it into either pass or fail would misrepresent actual compliance. `since` is optional; omitted means all-time. This has no dependency on `005`'s write path changing — it's a pure aggregate read over data `005` already produces.
