---
epic: 002-identity-access
feature: 010-account-and-team-settings-ui
status: open
dependencies: ["archive/002-team-hierarchy.md", "archive/006-api-keys.md", "backlog/004-app-shell-and-landing/002-app-shell-and-navigation.md"]
---

# Account & Team Settings UI

The real, finished org/team management and API-key settings pages, plus the top-level `teams` hierarchy view — owned by this BC per `bcs/identity-access/OWNERSHIP.md` (`src/app/(auth).../settings/*`). Composed into the shared shell from `004-app-shell-and-landing/002-app-shell-and-navigation.md`, built with real design directly rather than deferred to a later redesign pass, same pattern as `003-audit-compliance/003-audit-log-ui.md`.

**Status (2026-07-27): mockup pulled, spec written.** `SkillCanon Settings.dc.html` (claude.ai/design project `7babdbf3-c063-46b5-84df-ffa9f588d88a`) is the authoritative visual reference — pulled via the `claude_design` MCP server. Full requirements are now in `specs/019-account-team-settings-ui/spec.md`, gap-analyzed against `archive/002-team-hierarchy.md`/`archive/006-api-keys.md`. Two real backend gaps surfaced during that pass (not yet closed, tracked as this feature's own responsibility per the spec's Assumptions): team CRUD (`createTeam`/`updateTeam`/`reparentTeam`/`insertTeamBetween`) has no authorization check at the application layer today, and there is no "unassign from team without deactivating" operation — member removal needs one.

## Requirements

- [X] Pull the settings/teams mockup(s) from claude.ai/design before finalizing the rest of this list — done, see `specs/019-account-team-settings-ui/spec.md`
- [ ] `settings/api-keys`, org/team management settings, and the top-level `teams` hierarchy list/detail view — page inventory carried over from the now-dissolved `010-ui-polish-and-accessibility` epic's original redesign scope; full detail now in `specs/019-account-team-settings-ui/spec.md`'s Functional Requirements

## Acceptance Criteria

- [ ] Every core workflow (create/manage a team, issue/revoke an API key) works end-to-end through this UI
- [ ] Team hierarchy (parent/child structure) remains fully legible
- [ ] The page(s) visually match whatever mockup is pulled in

## Open Questions

- None currently — resolved by `specs/019-account-team-settings-ui/spec.md` (mockup identified as `SkillCanon Settings.dc.html`; member invite/removal scope and remove-member semantics resolved directly with the user during specification).

## Dependencies

- `archive/002-team-hierarchy.md`
- `archive/006-api-keys.md`
- `backlog/004-app-shell-and-landing/EPIC.md`

## Technical Notes

Pure UI over already-shipped, stable backend logic — team hierarchy depth/ordering logic itself is out of scope here.
