# Implementation Plan: Account & Team Settings UI

**Branch**: `019-account-team-settings-ui` | **Date**: 2026-07-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/019-account-team-settings-ui/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Build the real, finished `/teams` (org/team hierarchy list+detail) and `/settings/api-keys` pages inside the existing `(app)` route group's shell, ported directly from the `SkillCanon Settings.dc.html` Claude Design mockup, composing entirely from `identity-access`'s already-implemented team/user/invitation/API-key functions plus a small, well-scoped set of additions that closed two real gaps found while grounding the spec against the actual codebase: (1) team CRUD (`createTeam`/`updateTeam`/`reparentTeam`/`insertTeamBetween`) has no authorization check today — this feature adds an admin-only gate at the application layer, matching this bounded context's own established pattern (tenet D2); (2) "removing a member from a team" has no representation at all today (`users.team_id` is `NOT NULL`) — this feature migrates it to nullable, adds a dedicated `removeTeamMember` function (org admin or the team's owner) and a `listUnassignedUsers` read, and threads the resulting "unassigned" state through `authenticateSession` (still signs in, restricted view) and `authenticateApiKey` (keys stop working until reassigned).

## Technical Context

**Language/Version**: TypeScript 5.9 on Node.js 24; React 19.2

**Primary Dependencies**: Next.js 16.2 App Router — Server Components for initial data fetch, Client Components for the tree/tabs/drawer/modal interaction state, `"use server"` Server Actions for every mutation (same shape `(auth)/login,register,invite` already established in `015-auth-onboarding-ui`, the only server-mutation pattern this codebase has — see research.md §6). Drizzle ORM (`drizzle-orm@^0.45`, `drizzle-kit@^0.31`) for the one schema migration. No new runtime dependency.

**Storage**: PostgreSQL via `identity-access`'s existing repos, plus one schema change: `identity_access.users.team_id` `NOT NULL` → nullable (data-model.md). No new tables.

**Testing**: Vitest 4.1. Every new/changed `application/*` function gets a Testcontainers-backed test (red-green-iterate per constitution Principle I) — `removeTeamMember`, `listUnassignedUsers`, the admin-gate additions to `createTeam`/`updateTeam`/`reparentTeam`/`insertTeamBetween`, the nullable-`teamId` paths through `authenticateSession`/`authenticateApiKey`/`updateUser`, and `DuplicateTeamSlugError` handling in `createTeam`/`updateTeam`. Page/component structure verified via `renderToStaticMarkup` (this repo's established convention, no jsdom/Testing-Library). Interactive behavior (tree selection, tabs, drawers, the one-time key-reveal modal, copy-to-clipboard) verified in a real browser per `quickstart.md`.

**Target Platform**: Modern browsers served by the unified Next.js application (the same `app` Docker Compose service); no new deployment surface.

**Project Type**: Full-stack web application — touches `src/app/(app)/teams/*` and `src/app/(app)/settings/api-keys/*` (new route segments, both already anticipated by `nav-model.ts`'s existing hrefs), one guard clause in `src/app/(app)/layout.tsx` and a small null-safety fix in `src/app/(app)/_components/account-footer.tsx`, and `src/bcs/identity-access` (schema change, two new application functions, four functions gaining an authorization parameter, two functions gaining null-handling, `CONTRACT.md` updates).

**Performance Goals**: No specific new target beyond standard page load; team-tree filtering happens client-side against already-fetched data (no per-keystroke round-trip, contracts.md).

**Constraints**: FR-014 (this feature's own admin-gate additions must not change the *existing* team-hierarchy correctness guarantees — `getTeamChain` ordering, cycle/cross-org rejection — only add an authorization layer in front of them). The schema migration must not require a data backfill (existing rows keep their real `team_id`; only future rows may go `null`).

**Scale/Scope**: Two routes (`/teams`, `/settings/api-keys`), one schema migration, two new application functions, four functions gaining a required/optional `actingUser` parameter, two functions gaining null-handling for an unassigned owner, one new domain error (`DuplicateTeamSlugError`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Test-First Development** — PASS. Every new/changed application-layer function (research.md §1-5) gets a failing Testcontainers test before its implementation; every page/component gets a `renderToStaticMarkup` structural test written alongside it.
- **II. Domain-Driven Bounded Contexts** — PASS. All new/changed logic lives inside `identity-access`'s own `domain`/`application` layers, exposed only through its `CONTRACT.md`/barrel (data-model.md's Data contract changes). `src/app/(app)/teams/*` and `settings/api-keys/*` import the bounded context only through `@/bcs/identity-access`, never an internal module — matching every other route in this codebase.
- **III. Domain Invariants Live in the Domain Layer** — PASS. The new admin-only gate on team CRUD and the admin-or-team-owner gate on `removeTeamMember` live in `application/*`, not in a Server Action or route handler, reusing (not re-deriving) `authorize-invitation-management.ts`'s existing `assertCanManageInvitationsForTeam` for the latter (research.md §2-3).
- **IV. Multi-Tenant Isolation by Default** — PASS. No new tenant-scoped table; the schema change is a nullability relaxation on an existing, already-tenant-scoped column. `listUnassignedUsers` is `organizationId`-scoped from `actingUser.orgId`, matching every other org-scoped read in this BC. RLS is unaffected (`users`' isolation is keyed on `organization_id`, not `team_id` — data-model.md).
- **V. Secure by Default** — PASS. No new secret. `authenticateApiKey`'s new rejection condition (owner unassigned) is a *tightening* of existing behavior, not a weakening — an orphaned user's key was never meant to keep working. No raw key/token logged, unchanged from existing behavior.
- **VI. Auditable & Compliant (SOC2)** — PASS. `removeTeamMember` and the reassignment path (`updateUser`) both audit-log via the existing `record()`/`"user.updated"` path (research.md §4) — no mutation this feature adds is left unaudited. Team CRUD's new admin-gate rejection is itself a `NotAuthorizedError` throw, not a silent no-op, so an unauthorized attempt is visible in application logs even before reaching the audit-logged mutation point.
- **VII. Feature-Gated by Entitlement** — PASS, unchanged. `/teams` and `/settings/api-keys` render inside the `(app)` route group, which already gates on `coreFeaturesEnabled` via `resolveAppShellAccess` in the existing `(app)/layout.tsx` (`app-shell-access.ts`) — this feature adds no new entitlement key, consistent with these being core-tier features available to every org.

**Post-design re-check**: PASS. Phase 1 design (data-model.md, contracts/account-team-settings-ui.md) adds no new tenant-scoped table, no bounded-context boundary violation, and every new authorization check lives in the application layer per Principle III. No Complexity Tracking entry required.

## Project Structure

### Documentation (this feature)

```text
specs/019-account-team-settings-ui/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
├── contracts/
│   └── account-team-settings-ui.md
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── bcs/
│   └── identity-access/
│       ├── infrastructure/
│       │   ├── schema.ts                          # users.team_id → nullable
│       │   └── users-repo.ts                       # + listUnassigned(); findAppSessionUserById: innerJoin → leftJoin
│       ├── domain/
│       │   ├── user.ts                             # UserSummary.teamId, AppSessionUser.teamName → nullable
│       │   └── team.ts                             # + DuplicateTeamSlugError
│       ├── application/
│       │   ├── remove-team-member.ts                # NEW — admin-or-team-owner unassign
│       │   ├── remove-team-member.test.ts           # NEW
│       │   ├── list-unassigned-users.ts              # NEW — admin-only org-scoped read
│       │   ├── list-unassigned-users.test.ts         # NEW
│       │   ├── create-team.ts                       # + optional actingUser (admin gate) in options; + DuplicateTeamSlugError catch
│       │   ├── update-team.ts                       # + required actingUser (admin gate); + DuplicateTeamSlugError catch
│       │   ├── reparent-team.ts                     # + required actingUser (admin gate)
│       │   ├── insert-team-between.ts                # + required actingUser (admin gate); threads to internal createTeam
│       │   ├── update-user.ts                       # fields.teamId accepts null; skip team-lookup when null
│       │   ├── authenticate-session.ts               # handles owner.teamId === null → teamName null, still resolves
│       │   ├── authenticate-api-key.ts               # + owner.teamId === null rejection
│       │   └── *.test.ts                            # updated for the above signature/behavior changes
│       ├── CONTRACT.md                              # data-model.md's contract changes
│       └── index.ts                                 # + removeTeamMember, listUnassignedUsers exports
└── app/
    └── (app)/
        ├── layout.tsx                               # + guard: session.teamId === null → unassigned notice, not full shell
        ├── _components/
        │   ├── account-footer.tsx                    # teamName null-safe fallback ("Unassigned")
        │   └── unassigned-notice.tsx                  # NEW — mirrors access-unavailable.tsx's shape
        ├── teams/
        │   ├── page.tsx                              # server: initial team list + selected team detail
        │   ├── page.test.tsx
        │   ├── teams-explorer.tsx                     # client: tree/search/tabs/selection state
        │   ├── teams-explorer.test.tsx
        │   ├── team-form-drawer.tsx                   # client: create/edit/sub-team/insert-above
        │   ├── invite-member-drawer.tsx                # client
        │   ├── remove-member-confirm.tsx               # client
        │   ├── unassigned-users-panel.tsx              # client: admin-only list + assign-to-team
        │   └── actions.ts                             # "use server": createTeamAction, updateTeamAction, reparentTeamAction (via edit), insertTeamBetweenAction, inviteMemberAction, removeMemberAction, assignUserToTeamAction
        └── settings/
            └── api-keys/
                ├── page.tsx                           # server: listApiKeys(actingUser)
                ├── page.test.tsx
                ├── api-keys-list.tsx                   # client
                ├── issue-key-drawer.tsx                 # client
                ├── key-reveal-modal.tsx                 # client
                └── actions.ts                          # "use server": createApiKeyAction, revokeApiKeyAction
```

**Structure Decision**: New `src/app/(app)/teams/` and `src/app/(app)/settings/api-keys/` route segments inside the existing `(app)` route group — both already anticipated by `nav-model.ts`'s hrefs, so no navigation changes are needed, only the pages themselves. Interactive-but-page-scoped components live flat inside each route folder (matching `(auth)`'s per-route `_components`-free convention for single-consumer components — these aren't promoted to `src/shared/ui` since nothing else in the product uses tree-select/drawer-form chrome this specific). The `identity-access` bounded context absorbs every backend change; nothing crosses into `governance`, `audit-compliance`, or any other BC.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations — Constitution Check above is a full PASS pre- and post-design. No entry required.
