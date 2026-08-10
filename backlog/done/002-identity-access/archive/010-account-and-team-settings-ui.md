---
epic: 002-identity-access
feature: 010-account-and-team-settings-ui
status: open
dependencies: ["archive/002-team-hierarchy.md", "archive/006-api-keys.md", "backlog/004-app-shell-and-landing/002-app-shell-and-navigation.md"]
---

# Account & Team Settings UI

The real, finished org/team management and API-key settings pages, plus the top-level `teams` hierarchy view — owned by this BC per `bcs/identity-access/OWNERSHIP.md` (`src/app/(auth).../settings/*`). Composed into the shared shell from `004-app-shell-and-landing/002-app-shell-and-navigation.md`, built with real design directly rather than deferred to a later redesign pass, same pattern as `003-audit-compliance/003-audit-log-ui.md`.

**Status (2026-07-28): done.** `SkillCanon Settings.dc.html` (claude.ai/design project `7babdbf3-c063-46b5-84df-ffa9f588d88a`) is the authoritative visual reference — pulled via the `claude_design` MCP server. Implemented in `specs/019-account-team-settings-ui/` (spec → plan → tasks → analyze → implement, full loop). Both backend gaps this item originally flagged are now closed: team CRUD (`createTeam`/`updateTeam`/`reparentTeam`/`insertTeamBetween`) is admin-gated at the application layer, and `removeTeamMember` unassigns a member (rather than deactivating) with `listUnassignedUsers`/reassignment backing it. One new limitation surfaced and is tracked separately, not blocking: `docs/stubs.md` notes that reparenting a team back to root has no application function yet.

## Requirements

- [X] Pull the settings/teams mockup(s) from claude.ai/design before finalizing the rest of this list — done, see `specs/019-account-team-settings-ui/spec.md`
- [X] `settings/api-keys`, org/team management settings, and the top-level `teams` hierarchy list/detail view — built at `src/app/(app)/teams/*` and `src/app/(app)/settings/api-keys/*`, full detail in `specs/019-account-team-settings-ui/spec.md`'s Functional Requirements

## Acceptance Criteria

- [X] Every core workflow (create/manage a team, issue/revoke an API key) works end-to-end through this UI — verified via 51 automated test files (263 tests) plus live manual verification in a real browser session (create/edit/insert-above/new-sub-team/invite/remove/reassign all confirmed working against a real Postgres-backed dev server)
- [X] Team hierarchy (parent/child structure) remains fully legible — a real tree-ordering bug (flat alphabetical sort scattering a parent from its children) was found via that live verification and fixed, with a regression test added
- [X] The page(s) visually match whatever mockup is pulled in — spot-checked live against the mockup's dark tokens, teal accent, and drawer/modal chrome

## Open Questions

- None currently — resolved by `specs/019-account-team-settings-ui/spec.md` (mockup identified as `SkillCanon Settings.dc.html`; member invite/removal scope and remove-member semantics resolved directly with the user during specification).

## Dependencies

- `archive/002-team-hierarchy.md`
- `archive/006-api-keys.md`
- `backlog/004-app-shell-and-landing/EPIC.md`

## Technical Notes

Pure UI over already-shipped, stable backend logic — team hierarchy depth/ordering logic itself is out of scope here.
