# Research: Account & Team Settings UI

All items below were resolved by reading the actual current codebase (not `CONTRACT.md`'s aspirational text) rather than left as `NEEDS CLARIFICATION` — this feature's spec already went through one clarification round that surfaced the two backend gaps decisions 1 and 2 close.

## 1. Making `users.teamId` nullable (the "unassigned" state)

**Decision**: Drop `.notNull()` from `identity_access.users.team_id` in `src/bcs/identity-access/infrastructure/schema.ts`; generate a migration. `UserSummary.teamId` and `AppSessionUser.teamId` become `TeamId | null`; `AppSessionUser.teamName` becomes `string | null`.

**Rationale**: This is the only representation of "removed from team, not deactivated" the spec's FR-013/FR-014 require (spec Clarifications, 2026-07-27). No other column or flag exists today for this state.

**Ripple effects identified by reading every `teamId` touchpoint in `src/bcs/identity-access/application/`**:
- `infrastructure/users-repo.ts`'s `findAppSessionUserById` uses an `innerJoin` on `teams` keyed by `users.teamId` — for a `null` `teamId` this join would silently exclude the row, making `authenticateSession` return `null` for an orphaned user, i.e. silently sign them out. Must become a `leftJoin`, with `teamName` selected as nullable.
- `authenticateApiKey` (`application/authenticate-api-key.ts:33-36`) resolves `owner` and checks `!owner.isActive`; add `owner.teamId === null` to that same rejection branch (FR-015 — an orphaned user's keys stop authenticating).
- `update-user.ts`'s existing `if (fields.teamId !== undefined)` branch (line 61) already validates a *provided* teamId belongs to the caller's org — extend `UpdateUserFields.teamId` to `string | null` and skip the team-existence check when the value is `null` (unassigning needs no target-team validation).
- `create-user.ts`/`insert-validated-user.ts`/`InsertUserParams.teamId` stay `string`, required — every user is still created *into* a team; orphaning only ever happens via removal, never at creation.
- The shared app shell (`src/app/(app)/_components/account-footer.tsx`, `app-navigation.tsx`/`nav-model.ts`) currently assumes `teamName`/`teamId` are always present. Rather than null-proof every nav computation across BCs this feature doesn't own, `(app)/layout.tsx` gets one new guard: if the resolved session's `teamId` is `null`, render a small "not yet assigned to a team" notice (mirrors the existing `AccessUnavailable` component's shape) instead of the full shell — confines the blast radius to a single guard clause, consistent with the spec's edge case ("they remain able to sign in ... this feature only needs the admin-facing reassignment screen, not a special signed-in-but-unassigned experience beyond that").

**Alternatives considered**:
- *Soft-flag instead of nullable FK* (e.g. `is_orphaned boolean` + leave `team_id` pointing at their last team): rejected — contradicts "genuinely team-less" from the spec's Clarifications, and leaves a dangling reference that every team-scoped query would need to remember to re-check.
- *Reassign to parent team automatically instead of orphaning*: this was Option B in the spec's clarification and was explicitly not chosen.

## 2. Where "remove member" and "reassign" live

**Decision**: Two call paths, not one:
- **Remove** (unassign): new application function `removeTeamMember(tx, actingUser, targetUserId, options?)` in a new `application/remove-team-member.ts`. Loads the target user (`findByOrgAndId`, cross-org → `CrossOrgUserAccessError`, matching `updateUser`'s existing pattern), loads their *current* team, authorizes via the same rule `authorize-invitation-management.ts`'s `assertCanManageInvitationsForTeam` already encodes (org admin or that team's `ownerId`) — reused directly rather than re-implemented, then sets `teamId` to `null` via `users-repo.update` and audit-logs `user.updated` (reuses the existing verb; see decision 4 below).
- **Reassign**: no new function — `updateUser(tx, actingUser, targetUserId, { teamId: newTeamId })` already supports an admin setting a user's `teamId` to any team in their org (`update-user.ts:61-66`); the only change already covered by decision 1 is accepting `null` as a valid *previous* value, not a new capability.

**Rationale**: `updateUser`'s authorization is self-or-admin — it has no concept of "team owner acting on a member of their own team," which FR-013 explicitly requires (mirrors FR-011/FR-012's invite/revoke rule). Bolting a team-owner exception onto the general-purpose `updateUser` would entangle an unrelated authorization axis into a function every other field-edit path also uses. A dedicated function keeps the new authorization rule in one obvious place (tenet D2), matching how `revokeInvitation` already exists as its own function rather than being folded into a general update.

**New read function**: `listUnassignedUsers(tx, actingUser)` in `application/list-unassigned-users.ts` — admin-only (`NotAuthorizedError` otherwise), org-scoped, backed by a new `users-repo.listUnassigned(tx, organizationId)` using `isNull(users.teamId)`.

**Alternatives considered**: Extending `updateUser` with an optional `actingTeamOwnerOf` bypass — rejected, same entanglement concern as above; a reviewer would have to re-derive which field combinations are actually team-owner-safe.

## 3. Authorization for team structure CRUD (createTeam/updateTeam/reparentTeam/insertTeamBetween/listSubTeams)

**Decision**: Add an admin-only check to each. `createTeam` gets an *optional* `actingUser?: UserSummary` on its existing `options` object (extending `TeamAuditOptions`, which already has the `audit?`/`auditContext?` optional-flag precedent) — when present, `actingUser.role !== "admin"` throws `NotAuthorizedError`; when omitted, the check is skipped. `updateTeam`, `reparentTeam`, `insertTeamBetween` get a *required* `actingUser: UserSummary` parameter (new second/third positional arg) with the same check, no bypass. `listSubTeams` is a read — spec's FR-001/edge-cases say browsing is unrestricted, so it gets no new gate.

**Rationale, confirmed by reading every caller**: `createTeam` has exactly one internal (non-route) caller path — `provision-team-and-admin.ts`'s first-run bootstrap, which has no acting user yet (it's creating the very first admin+team atomically) and must keep working unchanged. Making `actingUser` optional (system caller = trusted, no check) rather than required avoids inventing a fake "system" `UserSummary` just to satisfy a type. `insertTeamBetween` calls `createTeam` internally too, but by the time a real request reaches it, it already has a real `actingUser` (the admin driving the insert) to thread through — so its own internal `createTeam` call passes `{ actingUser, ... }` and gets the same (here, redundant but harmless) check. `updateTeam`/`reparentTeam` have no internal callers at all outside their own tests (`provision-team-and-admin.ts` uses the *repository*-level `update` directly, per the existing `import { update as updateTeam } from "../infrastructure/teams-repo"` alias already flagged in this repo's own CLAUDE.md as a look-alike trap) — safe to make `actingUser` required with no optional escape hatch.

**Alternatives considered**: Gating at the route/Server Action layer only, leaving the application functions unchanged — rejected; this repo's tenet D2 and this exact bounded context's own prior Technical Notes (`archive/002-team-hierarchy.md`: "cycle-detection ... invariants belong in this feature's application service, not in a router/route-handler ... must apply identically whether the caller is REST API or an admin MCP tool") already establish that authorization of this shape belongs in the application layer, not the transport.

## 4. Audit action verbs for the two new mutations

**Decision**: Both `removeTeamMember` and the reassignment path (already `updateUser`) log with the existing `"user.updated"` action — no new verb.

**Rationale**: `audit-compliance/domain/audit-event.ts`'s `AUDIT_ACTION_VERBS` is a closed, color-mapped set (`created`/`updated`/`deleted`/`revoked`/`reparented`/`shared`/`accepted`/`login`/`logout`/`login_failed`/`synced`/`pruned`/`published`) consumed by the not-yet-built Audit Log UI (`backlog/003-audit-compliance/003-audit-log-ui.md`, still `status: open`). A team-membership change is, structurally, a `teamId` field update on a `user` row — exactly what `"user.updated"`'s before/after diff already represents (`teamId: "<uuid>" → null` or the reverse). Inventing `"user.removed_from_team"`/`"user.assigned_to_team"` would require touching `audit-compliance`'s taxonomy (a different bounded context this feature doesn't own) for a distinction the diff view already makes visible.

**Alternatives considered**: New verbs `removed_from_team`/`assigned_to_team` — rejected per above; would need `audit-compliance/domain/audit-event.ts` changes and a color assignment, out of this feature's BC ownership, for no functional gain.

## 5. Duplicate team-slug error handling

**Decision**: Wrap `teams-repo.insert`/`teams-repo.update` calls in `create-team.ts`/`update-team.ts` with the same `isUniqueViolation()` → typed-error pattern `update-user.ts` already uses for `DuplicateUserError` (`update-user.ts:76-85`). Add `DuplicateTeamSlugError` to `domain/team.ts`, thrown on a unique-constraint hit against the existing `(organization_id, slug)` composite unique index (`schema.ts:57` — already enforced at the DB level, just not caught today).

**Rationale**: Confirmed by reading `create-team.ts`/`update-team.ts`: neither catches the unique violation today, so a duplicate slug currently bubbles up as a raw Postgres error — inconsistent with every other duplicate-key path in this bounded context (`DuplicateUserError`, `DuplicateInvitationError`), and would surface as an ugly, non-actionable error in this feature's create/edit-team drawer. Low-risk, mechanical fix using an established pattern; not spent as a spec clarification question since there's only one reasonable behavior (friendly, specific error).

## 6. UI architecture

**Decision**: New `src/app/(app)/teams/` and `src/app/(app)/settings/api-keys/` route segments (both already anticipated by `nav-model.ts`'s existing `/teams` and `/settings/api-keys` hrefs — this feature is the first to actually build the pages behind them). Each page is a thin Server Component that resolves the session (`authenticateSession(authDb, cookieHeader)`, same per-page pattern already established by `(auth)/welcome/page.tsx` — no shared session context exists in this codebase to lift that call into) and fetches its initial data, wrapping a Client Component that owns the interactive tree-select/tabs/drawer/modal state, submitting mutations through `"use server"` Server Actions — the same shape `(auth)/login,register,invite` already established (`015-auth-onboarding-ui`'s plan.md), the only server-mutation pattern this codebase has.

**Rationale**: No existing precedent in this codebase for client-side data fetching (no tRPC/SWR/React Query dependency present) — Server Actions + Server Component initial fetch is the only idiomatic Next.js pattern already in use here, per Vercel Next.js guidance and this repo's own prior features.

**Alternatives considered**: A single monolithic client page fetching via `fetch()` against new REST routes — rejected; this repo has no precedent for a `src/app/api/**` REST surface backing its own first-party UI (Distribution's REST routes are for external/MCP consumption per `architecture.md`), and Server Actions avoid inventing one.

## 7. Testing approach

**Decision**: Matches `015-auth-onboarding-ui`'s established split — Testcontainers-backed Vitest tests for every new/changed `application/*` function (red-green-iterate per constitution Principle I); `renderToStaticMarkup` structural tests for Server/Client component markup; real-browser verification via `quickstart.md` for interactive behavior (drawers, tabs, tree selection, copy-to-clipboard) this repo has no jsdom/Testing-Library dependency to drive.

**Rationale**: No new testing dependency needed; directly reuses the one precedent this codebase already has for an interactive, multi-drawer authenticated UI feature.
