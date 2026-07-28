# Account & Team Settings UI Contract

## Routes

| Route | Auth requirement | Behavior on wrong state |
|---|---|---|
| `/teams` | Authenticated, assigned to a team | Unauthenticated → `/login`; unassigned (`teamId === null`) → the unassigned-notice screen instead of the full shell (no redirect — same session, restricted content, per research.md §1) |
| `/settings/api-keys` | Authenticated, assigned to a team | Unauthenticated → `/login`; unassigned → the unassigned-notice screen. **Correction from the original plan**: the `(app)` layout's unassigned guard (research.md §1) is a single route-group-wide gate with no per-route exception mechanism (Next.js layouts don't carry pathname info without added complexity) — so despite keys being personal, not team-scoped, an unassigned user still can't reach this page. Accepted as a minor, documented scope reduction rather than adding per-route layout logic for one edge case. |

Both render inside the existing `(app)` route group's shell (`AppShell`/`AppNavigation`), matching every other authenticated page — no standalone layout.

## `/teams` page contract

**Initial data** (Server Component): `getUser`'s org id from the session, then every team in the org (for the tree) plus the selected team's full detail — selection defaults to the signed-in user's own team, or (research.md §1) the unassigned-notice screen if the session itself has no team.

### Team tree sidebar

- Search input filters the already-fetched team list client-side by name (FR-002) — no server round-trip per keystroke.
- Each row: indent = depth from root (via each team's `parentTeamId` chain), name, member count.
- Selecting a row updates the detail panel without a full page navigation (client-side state), consistent with SC-006 ("no page reload required").
- Org admins only: an "Unassigned" entry above the tree, badge-counted, opening the unassigned-users list (FR-014) instead of a team.

### Team detail panel

Tabs: **Details** / **Sub-teams** (count) / **Members** (count) — matches the mockup exactly.

**Details tab**: name, slug, description, owner, parent (breadcrumb chip), created date. Admin-only actions: **Edit**, **Insert above**, **New sub-team**.

**Sub-teams tab**: list of direct children (name, slug, owner, member count, click-through). Empty state with "New sub-team" CTA when none exist (FR-009).

**Members tab**: list of `{ initial, name, email, role }`. Admin-or-team-owner-only actions: **+ invite member** (opens invite drawer), per-row remove (✕, opens a confirm step then calls `removeTeamMember`).

**Unassigned-users list** (admin-only, selected via the sidebar's "Unassigned" entry): flat list of `{ initial, name, email }`, each with an **Assign to team** control (select a team, calls `updateUser(..., { teamId })`).

### Team form drawer (create / edit / new sub-team / insert-above)

| Field | Input type | Notes |
|---|---|---|
| `name` | `text`, required | |
| `slug` | `text`, required, prefixed `@` | Duplicate → inline error from `DuplicateTeamSlugError` (research.md §5) |
| `description` | `textarea`, optional | |
| `parentTeamId` | `select`, edit mode only | Populated from every other team in the org; cross-org/cycle rejection surfaces inline (`CrossOrgReparentError`/cycle error) |
| `ownerId` | `select` | Populated from the team's current members |

- **Create**: `createTeam(db, { organizationId, name, slug, description }, { actingUser })`.
- **Edit**: `updateTeam(db, organizationId, teamId, fields, actingUser)`.
- **New sub-team**: `createTeam(...)` with `parentTeamId` preset to the currently-selected team, not shown as an editable field.
- **Insert above**: `insertTeamBetween(db, actingUser, childTeamId, { name, slug, description, ownerId })` — the selected team is `childTeamId`.

### Invite-member drawer

| Field | Input type | Notes |
|---|---|---|
| `email` | `email`, required | |
| `role` | `select` (`admin`/`member`) | |

Submit calls `inviteUser(db, actingUser, { teamId, email, role })`. `DuplicateInvitationError` → inline error (FR-012).

### Remove-member confirmation

A lightweight confirm step (not a full drawer) before calling `removeTeamMember(db, actingUser, targetUserId)`. Copy makes explicit that the member becomes unassigned (not deactivated) and their API keys stop working until reassigned — matching the spec's User Story 3 Scenario 2 wording, so there's no surprise at the moment of the click.

## `/settings/api-keys` page contract

**Initial data**: `listApiKeys(db, actingUser)` — the caller's own keys only (spec Assumptions — admin browsing another user's keys is out of scope).

### Key list

Each row: name, `{prefix}••••••••`, scope chips, created date, last-used date, status badge (active/revoked/expired), **Revoke** (active keys only, admin-or-self already enforced by `revokeApiKey`).

### Issue-key drawer

| Field | Input type | Notes |
|---|---|---|
| `name` | `text`, required | |
| `scopes` | checkbox list | Fixed set: `prompts:read`, `prompts:write`, `workflows:run` (research.md §6/spec Assumptions). Non-`:read` scopes disabled with "admin only" label for a `member` caller, per `isScopeAllowedForRole` |
| `expiresAt` | `select` (Never / 30 days / 90 days / 1 year) | |

Submit calls `createApiKey(db, actingUser, { name, scopes, expiresAt })`. Requires ≥1 scope (FR-020) — client-side guard plus whatever `createApiKey` itself already rejects.

### One-time reveal modal

Shows `rawKey` from `createApiKey`'s response, a copy button, and an explicit "won't be shown again" warning (FR-021) before the user dismisses it — the raw value is held only in the client component's transient state, never re-fetchable.

## Server Actions

All mutations are `"use server"` functions under each route's own `actions.ts` (mirrors `(auth)/login/actions.ts`'s shape) — no new REST routes. Each resolves the acting user via `authenticateSession(authDb, cookieHeader)` at the top of the action (a Server Action has no ambient session; it must re-resolve it, same as every page-level Server Component in this codebase already does) before calling into `@/bcs/identity-access`.
