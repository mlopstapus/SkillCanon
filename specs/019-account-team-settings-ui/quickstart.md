# Quickstart: Account & Team Settings UI

## Prerequisites

- `pnpm install`
- A running Postgres reachable via `DATABASE_URL`/`AUTH_DATABASE_URL`/`MIGRATION_DATABASE_URL` (`docker compose up -d database`, or the full stack) with migrations applied (`pnpm db:migrate`) — must include this feature's `users.team_id` nullable migration.
- At least one organization with a multi-level team hierarchy and more than one user — either from a prior `/register` + invites pass, or seeded directly.

## Run

```bash
pnpm dev
```

Open `http://localhost:3000/teams` (or `:3001` if `3000` is already bound by a prior `docker compose` session).

## Automated checks

```bash
pnpm vitest run src/bcs/identity-access
pnpm vitest run "src/app/(app)/teams"
pnpm vitest run "src/app/(app)/settings/api-keys"
pnpm typecheck
pnpm lint
pnpm build
```

## Manual verification (no jsdom in this repo — interaction/visual checks happen in a real browser)

1. **Browse the hierarchy**: visit `/teams` as any signed-in user. Confirm every team in the org appears in the tree, correctly indented, with member counts. Select a deeply-nested team — confirm the breadcrumb shows the full root-to-team path, not just the immediate parent. Type into the filter field — confirm the tree narrows.
2. **Non-admin gating**: sign in as a `member`. Confirm no Create/Edit/Insert/New-sub-team controls render anywhere in the Teams UI, and (on a team you don't own) no invite/remove controls in the Members tab.
3. **Create/edit/reparent** (as an admin): create a new team, confirm it appears in the tree immediately. Edit its name/slug/description/owner — confirm changes reflect without a page reload. Edit its parent to reparent it — confirm the tree and breadcrumb update. Attempt a slug that collides with an existing team in the org — confirm a friendly inline error, not a raw failure.
4. **Sub-team / insert-above**: from a selected team, create a sub-team — confirm it nests correctly and the empty state disappears. Use "Insert above" on a team with an existing parent — confirm the new team becomes its parent and the old parent becomes the new team's parent.
5. **Cycle/cross-org rejection**: attempt to set a team's parent to one of its own descendants — confirm a clear rejection, no partial change applied.
6. **Invite a member**: as an admin (or the team's owner), open a team's Members tab, invite a new email — confirm the invitation is created. Re-invite the same email to the same team — confirm the duplicate-pending-invitation message.
7. **Remove a member and reassign them**:
   - Remove an existing member from a team. Confirm they disappear from that team's Members list.
   - As an admin, open the "Unassigned" entry in the sidebar — confirm the removed user appears there.
   - While the user is unassigned, if they hold an API key, confirm a request using that key's raw value is rejected (see step 9 for how to test a key directly).
   - Assign the unassigned user to a different team from the Unassigned view — confirm they now appear in that team's Members list and disappear from Unassigned.
   - Re-check their API key — confirm it authenticates again with no change to the key itself.
8. **Sign in while unassigned**: remove the currently-signed-in test user from their team (using a second admin session), then reload `/teams` in the first session — confirm they see the "not yet assigned to a team" notice instead of the full shell, and remain otherwise signed in (not redirected to `/login`).
9. **Issue and revoke an API key**: visit `/settings/api-keys`. Issue a key with a name and at least one scope — confirm the raw value is shown exactly once with a copy button, and is gone after closing the modal (not re-visible anywhere). As a `member`, confirm write/run-level scopes are visible but disabled with an "admin only" explanation. Revoke an active key — confirm it's immediately marked revoked and remains in the list (not removed).
10. **Design parity**: spot-check colors/spacing/type/drawer-and-modal behavior against `SkillCanon Settings.dc.html` (re-fetch via `DesignSync get_file` if you need a side-by-side reference) — dark tokens, teal accent, right-side drawers, centered one-time-reveal modal.

## Expected outcome

All flows in `contracts/account-team-settings-ui.md` render and function per spec.md's Success Criteria SC-001 through SC-006, including the unassigned/reassignment flow added during clarification (spec.md's Clarifications section), with team CRUD and membership actions correctly gated per FR-004 through FR-016.
