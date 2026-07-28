---

description: "Task list for Account & Team Settings UI"
---

# Tasks: Account & Team Settings UI

**Input**: Design documents from `/specs/019-account-team-settings-ui/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/account-team-settings-ui.md, quickstart.md

**Tests**: Included — this repo's constitution (Principle I, Test-First Development) requires a failing test before any new backend logic; every new/changed `application/*` function and every new UI component gets one.

**Organization**: Tasks are grouped by user story (spec.md: US1/US2 are P1, US3/US4 are P2) to enable independent implementation and testing of each.

> **Revision note**: renumbered after `/speckit-analyze` (2026-07-27) — added T014 (a missing test for the account-footer null-`teamName` fix, matching this document's own test-first pattern everywhere else) and T067 (a missing `/settings/api-keys` nav-verification task, mirroring T024's `/teams` equivalent). T022, T023, T040 descriptions were sharpened per the same analysis. See the spec's Edge Cases (duplicate-slug bullet, added same pass) for the corresponding spec.md fix.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1/US2/US3/US4)

## Path Conventions

Single Next.js project at repository root — `src/bcs/identity-access/**` (backend) and `src/app/(app)/**` (UI), per plan.md's Project Structure.

---

## Phase 1: Setup

**Purpose**: Confirm the baseline is green before touching anything.

- [X] T001 Confirm local stack is current: `docker compose up -d database`, `pnpm db:migrate`, then `pnpm vitest run src/bcs/identity-access` — all green before starting (no code change; this is the baseline this feature's diffs are measured against)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The nullable-`team_id` schema change and its ripple through session/API-key auth and the shared app shell. US3 cannot exist without this; US1/US2/US4 don't strictly need it but share the touched files (`account-footer.tsx`, `layout.tsx`, `domain/user.ts`), so it goes first to avoid rework.

**⚠️ CRITICAL**: Complete this phase before starting US3. US1, US2, and US4 may start in parallel with this phase if staffed separately (see Parallel Team Strategy below) — none of their files overlap with this phase's.

### Tests for Foundational (write first, confirm they fail)

- [X] T002 [P] Add a test to `src/bcs/identity-access/infrastructure/schema.test.ts` asserting `identity_access.users.team_id` is nullable (`information_schema.columns.is_nullable = 'YES'`)
- [X] T003 [P] Add a test to `src/bcs/identity-access/application/authenticate-session.test.ts` asserting a session for a user with `team_id = null` still resolves (non-null `AppSessionUser`, with `teamId: null` and `teamName: null`)
- [X] T004 [P] Add a test to `src/bcs/identity-access/application/authenticate-api-key.test.ts` asserting a key whose owner has `team_id = null` resolves to `null` (auth rejected)
- [X] T005 [P] Add a test to `src/bcs/identity-access/application/update-user.test.ts` asserting an admin can set `fields.teamId = null` with no team-existence check firing

### Implementation for Foundational

- [X] T006 Edit `src/bcs/identity-access/infrastructure/schema.ts`: drop `.notNull()` from `users.teamId` (data-model.md's schema change)
- [X] T007 Generate and rename the migration: `MIGRATION_DATABASE_URL="postgresql://x:x@localhost:5432/skillcanon" pnpm db:generate`, then rename the `.sql` file and its `_journal.json` `tag` to `<timestamp>_identity_access_users_team_id_nullable` per `docs/context/database-conventions.md` — **note**: `pnpm db:generate` produced a bogus diff bundling unrelated already-applied catch-up DDL, because `drizzle/migrations/meta/0007,0008,0010-0013_snapshot.json` are missing from this repo (a pre-existing gap predating this feature — those migrations' `.sql` files exist and are applied, but their snapshot JSON was never committed). Fixed by keeping the auto-generated (accurate) `0014_snapshot.json` and hand-trimming `0014`'s `.sql` to just the real delta (`ALTER TABLE ... DROP NOT NULL`). Filed as a backlog item in Phase 7 (see T075a) rather than backfilling the historical gap here.
- [X] T008 [P] Edit `src/bcs/identity-access/domain/user.ts`: `UserSummary.teamId` → `TeamId | null`; `AppSessionUser.teamName` → `string | null` (also `User.teamId`, `UserAccountSummary.teamId` for consistency with the now-nullable DB column)
- [X] T009 Edit `src/bcs/identity-access/infrastructure/users-repo.ts`: `findAppSessionUserById`'s `innerJoin(teams, ...)` → `leftJoin`; `UpdateUserFields.teamId` → `string | null`; add `listUnassigned(tx, organizationId)` using `isNull(users.teamId)` (new export, consumed by US3)
- [X] T010 Edit `src/bcs/identity-access/application/authenticate-session.ts`: distinguish "teamId null" (legit unassigned, allow) from "teamId set but leftJoin found no same-org team" (M3 cross-org violation, still reject) — makes T003 pass without breaking the pre-existing cross-org test
- [X] T011 Edit `src/bcs/identity-access/application/authenticate-api-key.ts`: add `owner.teamId === null` to the existing `!owner.isActive` rejection branch (makes T004 pass)
- [X] T012 Edit `src/bcs/identity-access/application/update-user.ts`: change the `if (fields.teamId !== undefined)` branch to skip the team-existence lookup when `fields.teamId === null` (makes T005 pass)
- [X] T013 Edit `src/bcs/identity-access/CONTRACT.md`: apply data-model.md's `UserSummary`/`AppSessionUser` type diff to the Data Contracts section
- [X] T014 [P] Add a null-`teamName` case to the existing `src/app/(app)/_components/account-footer.test.tsx`, asserting the footer renders "Unassigned" (not a crash or blank) when `user.teamName` is `null` — write it failing before T015
- [X] T015 [P] Edit `src/app/(app)/_components/account-footer.tsx`: render `user.teamName ?? "Unassigned"` instead of assuming a non-null string (makes T014 pass)
- [X] T016 [P] Create `src/app/(app)/_components/unassigned-notice.tsx`, mirroring `access-unavailable.tsx`'s shape ("You're signed in, but not yet assigned to a team — ask an admin to assign you.")
- [X] T017 [P] Create `src/app/(app)/_components/unassigned-notice.test.tsx`: `renderToStaticMarkup` structural test for T016
- [X] T018 Edit `src/app/(app)/layout.tsx`: after resolving `access`, if `access.status === "allowed"` and `access.user.teamId === null`, render `<UnassignedNotice />` instead of `<AppShell>...</AppShell>`
- [X] T018a (discovered via `pnpm typecheck`) Edit `src/bcs/governance/application/resolve-effective-policies.ts` and `resolve-effective-objectives.ts`: both called `getTeamChain(db, orgId, user.teamId)` assuming non-null `teamId`. Fixed by skipping the team-chain resolution (empty chain) for an unassigned user rather than erroring — their own directly-assigned objectives/project-scoped items still resolve. Not anticipated in plan.md/research.md; a real cross-BC consumer of `UserSummary.teamId` this feature's type change touches.
- [X] T019 Run `pnpm vitest run src/bcs/identity-access` and `pnpm vitest run "src/app/(app)/_components"` and confirm T002–T005 and T014 now pass — 38 files/219 tests green; `pnpm typecheck` clean; `pnpm vitest run src/bcs/governance` (54 tests) confirmed green after T018a

**Checkpoint**: An unassigned (`teamId: null`) user can exist, sign in (restricted view), and their API keys correctly stop authenticating — even though no code path creates one yet until US3 ships. ✅ Foundational phase complete.

---

## Phase 3: User Story 1 - Browse the team hierarchy (Priority: P1) 🎯 MVP

**Goal**: Any signed-in, team-assigned user can open `/teams`, see the full org hierarchy as a tree, filter it, and select any team to see its full detail including a root-to-team breadcrumb.

**Independent Test**: Open `/teams` as any user; every team appears correctly indented with a member count; selecting a deeply-nested team shows its full breadcrumb, not just its immediate parent; the filter narrows the tree.

### Tests for User Story 1

- [X] T020 [P] [US1] ~~Write `renderToStaticMarkup` structural test `src/app/(app)/teams/page.test.tsx`~~ — **deviation**: `page.tsx`'s default export is an async Server Component doing real DB calls, with no separately-exported pure content component (unlike `(auth)/welcome/page.tsx`'s `WelcomePageContent` split). This repo's actual precedent (`dashboard/page.tsx` has no test at all; `welcome/page.tsx`'s test only covers its exported pure sub-component) is to not unit-test the async wrapper itself. All the assertions T020 wanted were folded into `teams-explorer.test.tsx` (T021) instead, the real testable surface.
- [X] T021 [P] [US1] Write structural/behavioral test `src/app/(app)/teams/teams-explorer.test.tsx`: every team renders with member count; selecting a nested team shows its full root-to-team breadcrumb; members list renders with real names/emails; the empty-state "New sub-team" CTA is present-but-disabled for admins and absent for non-admins — 5 tests, all passing. **Design fix made while writing this test**: the component originally unmounted inactive tab panels (`tab === "x" && (...)`), invisible to static markup with no jsdom/interaction available — changed to always render all three panels with visibility toggled by a `hidden` class instead, both testable and a defensible accessibility pattern.

### Implementation for User Story 1

- [X] T022 [US1] Create `src/app/(app)/teams/page.tsx`: server component — resolve `authenticateSession(authDb, cookieHeader)` (redirect `/login` if none), redirect `/dashboard` defensively if `teamId === null`, fetch the org's full team list and every org user via `listTeams`/`listUsers` inside one `withTenantContext(db, ...)` transaction, pass to `TeamsExplorer`. **Gap found and closed**: no existing function returned a whole-org flat team list or a single team's full detail (`listSubTeams`/`getTeamChain` only give one level or an ancestor chain) — added `listTeams(db, organizationId)` (full `Team[]`, so switching selection needs no further round-trip) and `getTeam(db, organizationId, teamId)` (general-purpose single-team read, kept even though `listTeams`'s full detail made it unneeded here), both test-first, both exported via `index.ts`/`CONTRACT.md` — not in the original plan/tasks.
- [X] T023 [US1] Create `src/app/(app)/teams/teams-explorer.tsx`: client component — indented tree from `parentTeamId` chains, client-side name filter (no server round-trip), Details/Sub-teams/Members tab switching (read-only in this phase — no mutation wired). The Sub-teams empty state's "New sub-team" CTA renders admin-gated and disabled (hidden entirely for non-admins) until T038/T040 wire it in US2.
- [X] T024 [US1] Verify `src/app/(app)/_components/nav-model.ts`'s existing `/teams` entry needs no change (confirmed — already points here)
- [ ] T025 [US1] Manual verification: quickstart.md step 1 (browse, filter, breadcrumb) — deferred to a consolidated browser pass once more of the UI exists

**Checkpoint**: User Story 1 is fully functional and independently testable — anyone can browse and inspect the hierarchy, with no mutation capability yet. (pending only the deferred manual browser check)

---

## Phase 4: User Story 2 - Manage team structure (Priority: P1)

**Goal**: An organization admin can create, edit, reparent, sub-team, and insert-above teams entirely through this UI, with cycle/cross-org attempts rejected with a clear message and non-admins seeing no such controls.

**Independent Test**: As an admin, create a team, edit it, reparent it, create a sub-team under it, and insert a new team above it — the hierarchy reflects every change immediately with no step outside this UI. As a non-admin, confirm none of these controls render.

### Tests for User Story 2

- [X] T026 [P] [US2] Add test cases to `src/bcs/identity-access/application/create-team.test.ts`: non-admin `actingUser` → `NotAuthorizedError`; admin `actingUser` → succeeds; `actingUser` omitted (bootstrap path) → succeeds unchanged
- [X] T027 [P] [US2] Add test cases to `src/bcs/identity-access/application/update-team.test.ts`: non-admin `actingUser` → `NotAuthorizedError`
- [X] T028 [P] [US2] Add test cases to `src/bcs/identity-access/application/reparent-team.test.ts`: non-admin `actingUser` → `NotAuthorizedError`
- [X] T029 [P] [US2] Add test cases to `src/bcs/identity-access/application/insert-team-between.test.ts`: non-admin `actingUser` → `NotAuthorizedError`; admin `actingUser` is threaded through to the internal `createTeam` call
- [X] T030 [P] [US2] Add test cases to `src/bcs/identity-access/application/create-team.test.ts` and `update-team.test.ts`: a slug colliding with another team in the same org → `DuplicateTeamSlugError`, not a raw Postgres error — **gap found**: `UpdateTeamFields` had no `slug` field at all (only `name`/`description`/`ownerId`), so the edit form's slug field (FR-005) would have had nothing to call; added it to `teams-repo.ts`.

### Implementation for User Story 2

- [X] T031 [US2] Edit `src/bcs/identity-access/domain/team.ts`: add `DuplicateTeamSlugError`
- [X] T032 [US2] Edit `src/bcs/identity-access/application/create-team.ts`: add optional `actingUser` to `TeamAuditOptions` (throw `NotAuthorizedError` when present and not admin; skip the check when omitted); wrap `insert()` with `isUniqueViolation()` → `DuplicateTeamSlugError` (makes T026, T030 pass)
- [X] T033 [US2] Edit `src/bcs/identity-access/application/update-team.ts`: add required `actingUser: UserSummary` parameter (admin-only); wrap `update()` with the same duplicate-slug handling (makes T027, T030 pass)
- [X] T034 [US2] Edit `src/bcs/identity-access/application/reparent-team.ts`: add required `actingUser: UserSummary` parameter (admin-only) (makes T028 pass)
- [X] T035 [US2] Edit `src/bcs/identity-access/application/insert-team-between.ts`: add required `actingUser: UserSummary` parameter (admin-only), pass `{ actingUser, ... }` through to its internal `createTeam` call (makes T029 pass)
- [X] T036 [US2] Edit `src/bcs/identity-access/CONTRACT.md`: note the `actingUser`/admin-gate addition on `createTeam`/`updateTeam`/`reparentTeam`/`insertTeamBetween`'s rows — done in the same edit as T035/CONTRACT's Foundational update, verified accurate
- [ ] T037 [P] [US2] Write structural test `src/app/(app)/teams/team-form-drawer.test.tsx`
- [ ] T038 [US2] Create `src/app/(app)/teams/team-form-drawer.tsx`: client component — create/edit/new-sub-team/insert-above modes per `contracts/account-team-settings-ui.md`'s Team form drawer table, surfacing `DuplicateTeamSlugError`/`CrossOrgReparentError`/cycle-rejection inline
- [ ] T039 [US2] Create `src/app/(app)/teams/actions.ts`: `"use server"` `createTeamAction`, `updateTeamAction`, `insertTeamBetweenAction` — each resolves the acting user via `authenticateSession(authDb, cookieHeader)` before calling into `@/bcs/identity-access`
- [ ] T040 [US2] Edit `src/app/(app)/teams/teams-explorer.tsx`: add admin-only Create/Edit/Insert-above/New-sub-team buttons wired to `team-form-drawer.tsx` and `actions.ts`, gated on `user.role === "admin"`; after each successful Server Action, refresh the tree/detail data client-side (e.g. `router.refresh()`) so the change is visible with no full page reload (SC-006)
- [ ] T041 [US2] Manual verification: quickstart.md steps 2–5 (non-admin gating, create/edit/reparent, sub-team/insert-above, cycle/cross-org rejection)

**Checkpoint**: User Stories 1 and 2 both work independently — full read + admin-write team structure management.

---

## Phase 5: User Story 3 - Manage team membership (Priority: P2)

**Goal**: An org admin or a team's owner can invite a member by email and remove one (unassigning them, not deactivating); an admin can see and reassign unassigned users; a removed member's API keys stop working until reassigned.

**Independent Test**: Invite a member to a team, confirm the invitation is created. Remove an existing member, confirm they disappear from the team but appear in the admin-only unassigned-users view, then reassign them into a different team and confirm they appear there instead.

### Tests for User Story 3

- [ ] T042 [P] [US3] Write failing test `src/bcs/identity-access/application/remove-team-member.test.ts`: admin removes a member → target's `teamId` becomes `null`; the team's own owner (non-admin) removes a member of that same team → succeeds; a non-admin, non-owner caller → `NotAuthorizedError`; a cross-org target id → `CrossOrgUserAccessError`
- [ ] T043 [P] [US3] Write failing test `src/bcs/identity-access/application/list-unassigned-users.test.ts`: admin sees every unassigned user in their own org; non-admin caller → `NotAuthorizedError`; a different org's unassigned users never appear
- [ ] T044 [P] [US3] Add an end-to-end test case (to `authenticate-api-key.test.ts` or a new integration test) covering the full loop: issue a key, remove the owner from their team, confirm `authenticateApiKey` now returns `null`, reassign the owner to a team, confirm it authenticates again with no change to the key row

### Implementation for User Story 3

- [ ] T045 [US3] Create `src/bcs/identity-access/application/remove-team-member.ts`: reuse `authorize-invitation-management.ts`'s `assertCanManageInvitationsForTeam` for the admin-or-team-owner check (research.md §2), then `users-repo.update(tx, targetUserId, { teamId: null })`, then `record()` an audit event with action `"user.updated"` (before/after showing the `teamId` change)
- [ ] T046 [US3] Create `src/bcs/identity-access/application/list-unassigned-users.ts`: admin-only (`NotAuthorizedError` otherwise), org-scoped via `users-repo.listUnassigned` (from T009)
- [ ] T047 [US3] Edit `src/bcs/identity-access/index.ts`: export `removeTeamMember`, `listUnassignedUsers`
- [ ] T048 [US3] Edit `src/bcs/identity-access/CONTRACT.md`: add the `removeTeamMember`/`listUnassignedUsers` rows to Exposed APIs per data-model.md
- [ ] T049 [P] [US3] Write structural test `src/app/(app)/teams/invite-member-drawer.test.tsx`
- [ ] T050 [P] [US3] Write structural test `src/app/(app)/teams/remove-member-confirm.test.tsx`
- [ ] T051 [P] [US3] Write structural test `src/app/(app)/teams/unassigned-users-panel.test.tsx`
- [ ] T052 [US3] Create `src/app/(app)/teams/invite-member-drawer.tsx`: client — email + role form, calls `inviteUser` via a Server Action, surfaces `DuplicateInvitationError` inline
- [ ] T053 [US3] Create `src/app/(app)/teams/remove-member-confirm.tsx`: client — lightweight confirm step explaining the member becomes unassigned (not deactivated) and their API keys stop working until reassigned, per `contracts/account-team-settings-ui.md`
- [ ] T054 [US3] Create `src/app/(app)/teams/unassigned-users-panel.tsx`: client — admin-only list from `listUnassignedUsers`, each row with an "Assign to team" select calling `updateUser(..., { teamId })`
- [ ] T055 [US3] Edit `src/app/(app)/teams/actions.ts`: add `"use server"` `inviteMemberAction`, `removeMemberAction`, `assignUserToTeamAction`
- [ ] T056 [US3] Edit `src/app/(app)/teams/teams-explorer.tsx`: wire the Members tab's invite/remove controls (admin-or-team-owner gated) and a sidebar "Unassigned" entry (admin-only) opening `unassigned-users-panel.tsx`
- [ ] T057 [US3] Manual verification: quickstart.md steps 6–8 (invite, remove + reassign, sign-in-while-unassigned)

**Checkpoint**: User Stories 1, 2, and 3 all work independently.

---

## Phase 6: User Story 4 - Manage personal API keys (Priority: P2)

**Goal**: Any signed-in user can issue a scoped API key (seeing the raw value once), view their own keys, and revoke an active one — fully independent of every other story (no shared files with Phases 2–5).

**Independent Test**: Issue a key, confirm the raw value shows once and is copyable, confirm it's gone from view after closing the modal, revoke an active key and confirm it's marked revoked but stays listed.

### Tests for User Story 4

- [ ] T058 [P] [US4] Write structural test `src/app/(app)/settings/api-keys/page.test.tsx`
- [ ] T059 [P] [US4] Write structural test `src/app/(app)/settings/api-keys/api-keys-list.test.tsx`: revoked keys stay visible, marked revoked, with no Revoke control
- [ ] T060 [P] [US4] Write structural test `src/app/(app)/settings/api-keys/issue-key-drawer.test.tsx`: a `member`-role caller sees write/run scopes present but disabled
- [ ] T061 [P] [US4] Write structural test `src/app/(app)/settings/api-keys/key-reveal-modal.test.tsx`

### Implementation for User Story 4

- [ ] T062 [US4] Create `src/app/(app)/settings/api-keys/page.tsx`: server — resolve session, `listApiKeys(db, actingUser)`
- [ ] T063 [US4] Create `src/app/(app)/settings/api-keys/api-keys-list.tsx`: client — key rows (name, prefix, scope chips, dates, status badge, Revoke for active keys only)
- [ ] T064 [US4] Create `src/app/(app)/settings/api-keys/issue-key-drawer.tsx`: client — name/scopes/expiry form; disables (not hides) non-`:read` scopes for `member` callers per `isScopeAllowedForRole`; requires ≥1 scope
- [ ] T065 [US4] Create `src/app/(app)/settings/api-keys/key-reveal-modal.tsx`: client — one-time raw-key display, copy-to-clipboard, explicit "won't be shown again" warning; raw value held only in transient client state
- [ ] T066 [US4] Create `src/app/(app)/settings/api-keys/actions.ts`: `"use server"` `createApiKeyAction`, `revokeApiKeyAction`
- [ ] T067 [US4] Verify `src/app/(app)/_components/nav-model.ts`'s existing `/settings/api-keys` entry needs no change (confirm only — mirrors T024's `/teams` equivalent)
- [ ] T068 [US4] Manual verification: quickstart.md step 9 (issue/reveal/copy, scope capping, revoke)

**Checkpoint**: All four user stories are independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Whole-feature verification, matching this repo's `as-finish` expectations.

- [ ] T069 [P] Run `pnpm typecheck` and fix any remaining fallout from the nullable-`teamId` type change
- [ ] T070 [P] Run `pnpm lint` and fix
- [ ] T071 Run `pnpm vitest run src/bcs/identity-access` and `pnpm vitest run "src/app/(app)"` — confirm fully green
- [ ] T072 Run `pnpm build` — confirm the production build succeeds (`.next/standalone` output, per this repo's known Dockerfile bundling constraints)
- [ ] T073 Design-parity pass against `SkillCanon Settings.dc.html` (quickstart.md step 10) — colors, spacing, type, drawer/modal behavior
- [ ] T074 Review `docs/stubs.md` — confirm no entry was ever needed (everything above was fully wired, not stubbed); add one only if something genuinely had to be deferred
- [ ] T075 Update `backlog/002-identity-access/010-account-and-team-settings-ui.md`: check off completed Requirements/Acceptance Criteria; move to `backlog/002-identity-access/archive/` if every item is met (per this repo's archival convention — leave `status: open` and don't archive if anything remains unchecked)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup. Blocks US3 (Phase 5) only — see note below.
- **US1 (Phase 3)**, **US2 (Phase 4)**, **US4 (Phase 6)**: Depend only on Setup; none touch a file Foundational changes, so they may proceed in parallel with Phase 2 if staffed separately.
- **US3 (Phase 5)**: Depends on Foundational (Phase 2) completing — needs the nullable schema, `listUnassigned`, and the auth-path null-handling to exist first. Also benefits from US1's `teams-explorer.tsx` existing (it extends the Members tab and sidebar) but does not strictly require US2.
- **Polish (Phase 7)**: Depends on every phase above being complete.

### User Story Dependencies

- **US1 (P1)**: No dependency on other stories. True MVP candidate.
- **US2 (P1)**: Extends `teams-explorer.tsx` from US1 with write controls — build US1 first in practice, though US2's own backend tasks (T026–T036) have no code dependency on US1.
- **US3 (P2)**: Extends the same `teams-explorer.tsx` (Members tab, sidebar) — build after US1; independent of US2's team-structure controls.
- **US4 (P2)**: Fully independent — no shared file with US1/US2/US3/Foundational. Could be built first, last, or in parallel by a separate developer.

### Parallel Opportunities

- All Foundational tests (T002–T005) in parallel; T008, T014, T016–T017 in parallel once T006/T007 land.
- US2's four authorization test additions (T026–T029) in parallel; US2's slug-uniqueness test (T030) in parallel with those.
- US3's three new-function tests (T042–T044) in parallel; its three component tests (T049–T051) in parallel.
- US4's four component tests (T058–T061) in parallel — the entire phase can run in parallel with Phases 2–5 by a separate developer.

---

## Parallel Example: Foundational

```bash
Task: "Add nullable-team_id column test in src/bcs/identity-access/infrastructure/schema.test.ts"
Task: "Add null-team session test in src/bcs/identity-access/application/authenticate-session.test.ts"
Task: "Add null-team API-key rejection test in src/bcs/identity-access/application/authenticate-api-key.test.ts"
Task: "Add null-team update-user test in src/bcs/identity-access/application/update-user.test.ts"
```

## Parallel Example: User Story 4 (fully independent)

```bash
Task: "Structural test src/app/(app)/settings/api-keys/page.test.tsx"
Task: "Structural test src/app/(app)/settings/api-keys/api-keys-list.test.tsx"
Task: "Structural test src/app/(app)/settings/api-keys/issue-key-drawer.test.tsx"
Task: "Structural test src/app/(app)/settings/api-keys/key-reveal-modal.test.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup
2. Phase 3: User Story 1 (Foundational is not required for US1 — see Dependencies above)
3. **STOP and VALIDATE**: quickstart.md step 1
4. Deploy/demo read-only team browsing if that alone is valuable

### Incremental Delivery (recommended — matches this feature's actual priority order)

1. Setup → Foundational (small, de-risks the schema change early) → US1 → validate → demo
2. Add US2 → validate → demo (full team-structure management)
3. Add US4 in parallel at any point (fully independent) → validate → demo
4. Add US3 last (needs Foundational) → validate → demo (membership + unassigned/reassignment loop)
5. Phase 7: Polish, then hand off to `/speckit-analyze` → `/as-finish`

### Parallel Team Strategy

- Developer A: Foundational → US3 (the schema-dependent thread)
- Developer B: US1 → US2 (the team-structure thread)
- Developer C: US4 (fully independent, any time)

---

## Notes

- [P] tasks touch different files with no unresolved dependency.
- Every `application/*` test task must fail before its paired implementation task lands (constitution Principle I).
- Commit after each task or logical group, per this repo's conventional workflow.
- Stop at any Checkpoint to validate a story independently before continuing.
