---
epic: 008-distribution
feature: 003-web-ui-shell-and-core-pages
status: open
dependencies: ["001-rest-api-core-routes.md", "backlog/004-app-shell-and-landing/EPIC.md"]
---

# Web UI Final Composition & Integration Check

**Scope reduced (2026-07-23)**: this feature originally owned building the entire app shell and every core page. Both responsibilities moved earlier in the backlog once real design mockups made that possible sooner than epic 008's original slot: the app shell/layout/auth-gated routing now belongs to `004-app-shell-and-landing/002-app-shell-and-navigation.md`, and each BC's own pages are now built by that BC's own epic (`003-audit-compliance/003-audit-log-ui.md`, `005-governance/005-governance-views-ui.md`, `006-prompt-registry/006-prompt-registry-views-ui.md`, `007-workflow-orchestration/005-workflow-views-ui.md`, `002-identity-access/009-auth-and-onboarding-ui.md` + `010-account-and-team-settings-ui.md`, `009-billing-entitlements/003-billing-portal-and-ui.md`) — mirroring `003-audit-log-ui.md`'s original pattern. This feature no longer builds a page or the shell; it's the point where every one of those already-built pieces gets composed together and re-verified as a working whole against the new REST API, since each was built independently in its own epic.

## Requirements

- [ ] Every owning BC's page (see list above) is actually wired into the real shell from `004-app-shell-and-landing/002-app-shell-and-navigation.md` — no BC left composing into a stale/placeholder shell
- [ ] Any standalone shell/middleware stand-in a BC epic had to build ahead of `004-app-shell-and-landing` (only `003-audit-compliance/003-audit-log-ui.md` did this, as an explicitly-flagged one-off) is confirmed absorbed and deleted, not left running in parallel
- [ ] Full page-by-page parity audit against the legacy `legacy/frontend/src/app/*` tree — confirm nothing was missed across the now-distributed set of owning epics

## Acceptance Criteria

- [ ] Every core workflow available in the legacy frontend (create/view/edit a prompt, policy, objective, workflow, team, project) is available in the rebuilt UI, end to end, through the real composed shell
- [ ] Unauthenticated access to any `(app)` route redirects to login
- [X] Manual smoke test: create a team → create a project → create a policy → create a prompt → expand it via the UI, confirms the applied policy appears in the result

## Open Questions

- None currently — the page-by-page parity list is this feature's own first requirement now, not an open question to resolve later.

**Status check (2026-08-05):** app-shell composition and most owning-epic pages are real and wired into the live shell (dashboard, metrics, projects, prompts, settings/api-keys, settings/audit-log, teams, all auth pages) — unauthenticated `(app)` redirect confirmed (`src/app/(app)/layout.tsx:17`). But per this item's own Acceptance Criteria above, there is a real, confirmed gap: **no policy or objective UI exists anywhere in `src/app`** (create/edit/delete forms existed in `legacy/frontend/src/app/teams/page.tsx`, ~lines 90-403; nothing equivalent has been built in the new app). Per this file's own Technical Notes, tracking the gap back to its owning epic rather than building it here: this item cannot close until `backlog/005-governance/005-governance-views-ui.md` ships. That same gap also blocks `backlog/010-ui-polish-and-accessibility/001-cross-page-polish-and-accessibility.md`'s own required smoke test.

**Update (2026-08-05):** `005-governance-views-ui` shipped and archived (`backlog/005-governance/archive/005-governance-views-ui.md`) — the policy/objective UI gap above is closed; `/teams/[teamId]/policies` and `/objectives` are real, live-verified pages (scope tree, inherited/local split, create/edit/delete for both, all four policy enforcement types).

**Update (2026-08-05, smoke test run):** the full manual smoke test now passes end-to-end against a live self-hosted instance: created team "Platform" (via registration) → project "Smoke Test Project" → policy `require-typed-errors` (`append`, at Platform) → prompt `smoke-test-prompt` → Preview tab shows the rendered user message with the policy's content correctly appended, and the Applied Policies tab correctly lists it (1 entry, `append` / `require-typed-errors`). That Acceptance Criteria bullet is now checked off. The other two Acceptance Criteria (full legacy-parity workflow coverage including workflow/run, and unauthenticated-redirect — the latter already previously confirmed) and both remaining Requirements (shell-composition audit, standalone-shell-stand-in cleanup, legacy parity audit) still haven't been run in this session — this item stays `open`.

**Side finding (not actioned here, already tracked):** the prompt creation/new-version UI has no input-schema field at all, so any `{{ variable }}` in a template throws a Nunjucks strict-undefined error in Preview (no way to supply a value through this UI). This is expected given the current state of the still-in-progress skill-file-format transition — `backlog/006-prompt-registry/011-skill-file-format-refactor.md` already explicitly plans to remove `inputSchema` entirely in favor of markdown + template files (calling the current `inputSchema` "already unvalidated, dead weight"), so this isn't a new gap to file, just a live confirmation that refactor is real, needed work. The smoke test above avoided it by using a template with no `{{ }}` placeholders.

## Dependencies

- `001-rest-api-core-routes.md`
- `backlog/004-app-shell-and-landing/EPIC.md`

## Technical Notes

This feature is now an integration/verification checkpoint, not a build — by the time it starts, every page it touches should already exist and be individually working within its own owning epic. If a real gap surfaces here (a page nobody actually built, a BC that skipped composing into the shell), track it back to that BC's own epic rather than building it inline in this feature.
