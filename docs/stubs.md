# Stubs

Tracks placeholder/incomplete implementations left in the codebase on purpose (a UI affordance wired to a no-op, a function returning fixture data, a flow deferred to a later feature) — so they don't get forgotten once real work lands on top of them.

## Convention

- When you stub something out (leave a button non-functional, hardcode a value that should come from a real source, defer a code path), add a row below in the same change.
- When a stub gets fully wired up, delete its row in the same change rather than marking it done in place — this file should only ever list what's currently stubbed, not a historical log (git history covers that).
- Each row: what's stubbed, where, why, and what finishing it requires.

## Open Stubs

| What | Where | Why stubbed | To resolve |
|------|-------|-------------|------------|
| Editing a team's parent to "root" (removing its parent) | `src/app/(app)/teams/team-form-drawer.tsx` (edit mode's Parent team select) | `reparentTeam(tx, teamId, newParentId, ...)` requires a non-null `newParentId` — no application-layer function can set `parent_team_id` back to `null`, even though the repo's `updateParent(tx, id, parentTeamId: string \| null)` supports it. An already-root team's own select shows a disabled placeholder instead of a real "— (root)" option; a non-root team can be reparented to any *other* real team, just not back to root. | Add a `parentTeamId: string \| null` overload (or a separate `unparentTeam`) to `reparentTeam`/`insertTeamBetween`'s neighborhood in `identity-access`, update `CONTRACT.md`, then remove this row and the drawer's placeholder branch. |
| Sub-teams empty state's "New sub-team" CTA button, when rendered by an admin | `src/app/(app)/teams/teams-explorer.tsx` (Sub-teams tab empty state) | Intentionally disabled (`disabled aria-disabled title="Coming soon"`) — wired to the real `team-form-drawer.tsx` in the same US2 phase, but if you're reading this after that landed and it's still disabled, the wiring in `teams-explorer.tsx`'s `onClick` was missed. | Confirm the button's `onClick` opens `TeamFormDrawer` with `mode="sub"` and `contextTeam` set to the currently selected team; remove `disabled`/`aria-disabled`/`title` once confirmed, then delete this row. |
