# Implementation Plan: Prompt Registry Views UI

**Branch**: `023-prompt-registry-views-ui` | **Date**: 2026-07-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/023-prompt-registry-views-ui/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Build the real `src/app/(app)/prompts/*` and `/projects/*` pages, ported from the `SkillCanon Prompts.dc.html` Claude Design mockup, composed into the existing app shell (the sidebar already links to `/prompts` and `/projects` — both currently 404). This is the **first real route/server-action caller** of almost every `src/bcs/prompt-registry` application function shipped by `002-prompt-and-version-model`, `003-prompt-sharing`, `007-project-skill-assignment`, and the project CRUD/membership functions — all of that logic already exists and is already tested, but only ever exercised from unit tests and test-helpers today. The bulk of this feature's own new work is: (1) wiring real server actions to that existing logic, (2) three genuinely new capabilities the spec's Clarifications called for — `reactivatePrompt` (mirrors the existing one-way `deprecatePrompt`), project-as-subscriber sharing (widen `subscriptions.subscriberType` to include `"project"`, reusing the existing owner-team-admin authorization rule), and a new `project_repos` table + CRUD (linking git repos to a project, entirely new — no prior feature modeled this) — and (3) fixing a real audit-logging gap discovered while reading the code: `deprecatePrompt` and `rollbackPrompt` currently perform their mutation with no `withAudit`/`record()` call at all, unlike every sibling mutation in this bounded context (a Constitution Principle VI gap that becomes load-bearing the moment this feature becomes their first real caller).

## Technical Context

**Language/Version**: TypeScript 5, Next.js 16 (App Router), React 19

**Primary Dependencies**: Drizzle ORM (`postgres-js` driver), Tailwind v4 (`@theme inline`, no `tailwind.config.ts`), `src/shared/ui` (Badge, Table, `cn()` — no dedicated Drawer/Tabs/Modal primitive exists yet, see research.md), `src/bcs/prompt-registry` (nearly every exposed function — see data-model.md), `src/bcs/identity-access` (`authenticateSession`, `getOrganization`, `getTeam`, `getUser`, `listUsers`, `listTeams`, `UserSummary` — used to build the first real `ProjectIdentityVerifier` implementation), `src/bcs/audit-compliance` (`withAudit`, `record` — for the two audit-gap fixes)

**Storage**: PostgreSQL via `prompt_registry` schema. One new table (`project_repos`, RLS-protected via its parent `projects` row, matching `project_teams`'s existing join-based RLS pattern) and one widened TypeScript enum (`subscriptions.subscriberType` gains `"project"` — no migration needed, since that column is a plain `text NOT NULL` with no DB-level CHECK constraint, confirmed by reading `drizzle/migrations/0017_prompt_registry_subscriptions.sql`)

**Testing**: Vitest — Testcontainers-backed tests for every new/changed `application/`+`infrastructure/` function (this repo's established pattern, no mocked DB), `renderToStaticMarkup`-only tests for React components (no jsdom/click-simulation) per this repo's established convention

**Target Platform**: Server-rendered Next.js App Router pages within the existing `(app)` route group, self-hosted via Docker Compose or the existing CI/CD pipeline

**Project Type**: Web application — single unified Next.js app (per `docs/context/repo-structure.md`); no separate frontend/backend split

**Performance Goals**: No new performance envelope — org-scoped catalog-sized lists (prompts, projects, members, versions), not unbounded event logs; no pagination precedent exists for comparably-sized lists elsewhere in this app (`teams-explorer`, `api-keys-list`) and none is warranted here either

**Constraints**: Every mutating action must be gated server-side (not just hidden UI) by the same authorization rules already enforced in the application layer (`assertAuthorizedForOwner`'s org-admin-or-team-owner rule); a `"use client"` component must never import a real (non-type) value from `@/bcs/prompt-registry`'s barrel directly (drags server-only deps like `postgres` into the browser bundle per this repo's documented gotcha) — all BC calls happen in `page.tsx` (server) or `actions.ts` (`"use server"`)

**Scale/Scope**: Two page trees (`prompts/{list,new,[name],[name]/new-version}`, `projects/{list,[id]}`), ~9 drawers/modals, 3 new backend capabilities (`reactivatePrompt`, project-subscriber sharing, `project_repos` CRUD), 2 audit-gap fixes (`deprecatePrompt`, `rollbackPrompt`), 1 new cross-BC wiring point (`ProjectIdentityVerifier`'s first real implementation), 1 new `prompts-repo` query extension (accessible-set resolution gains project-subscription membership), 1 new `project-members-repo` query (`listProjectIdsForUser`, needed by that extension)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The constitution predates the TypeScript rewrite and describes the legacy Python/FastAPI stack, but states its principles apply "regardless of implementation language." Evaluated against this repo's current TypeScript conventions:

- **I. Test-First (P1)**: Every new/changed application-layer function (`reactivate-prompt.ts`, the widened `subscribe-skill.ts`/`unsubscribe-skill.ts`/`authorize-owner-action.ts`, `add-project-repo.ts`/`remove-project-repo.ts`/`list-project-repos.ts`, the audited `deprecate-prompt.ts`/`rollback-prompt.ts`, the accessible-set query extension) gets a Testcontainers-backed test written alongside it, per `tasks.md`.
- **II. Domain-Driven Bounded Contexts (D1)**: All new UI composes `prompt-registry` and `identity-access` exclusively through their public barrels (`@/bcs/prompt-registry`, `@/bcs/identity-access`), matching `eslint-plugin-boundaries` enforcement. The one new cross-cutting piece — resolving "does this user belong to this org/team" for `ProjectIdentityVerifier` — is composed in the route/action layer (`src/app/(app)/projects/actions.ts`) from `identity-access`'s already-exported getters, not duplicated inside `prompt-registry`.
- **III. Domain Invariants in Domain Layer (D2)**: The one new business rule this feature adds — "a project-level sharing grant is authorized the same way managing that project's collaborator teams is" — lives in `authorize-owner-action.ts` (the existing shared authorization helper both `subscribeSkill`/`unsubscribeSkill` already call), not duplicated into a route handler.
- **IV. Multi-Tenant Isolation (M1-M3)**: New `project_repos` table gets RLS in the same migration that creates it (never deferred to a later feature, unlike the historical `005-prompt-registry-tenant-isolation-tests` gap this repo has hit before) — join-based policy through its parent `projects` row, mirroring `project_teams`'s already-shipped pattern. Every new/changed application function takes an org-scoped actor and never trusts a path/body-supplied org id alone.
- **V. Secure by Default (S1-S3)**: No new secret-handling surface. Template rendering for the "rendered preview" (FR-009) goes through the existing sandboxed Nunjucks `Environment` in `template-renderer.ts` via the existing `expand()` function — this feature never constructs its own renderer.
- **VI. Auditable & Compliant (C1-C2)**: **Gap found and fixed as part of this feature** — `deprecatePrompt` and `rollbackPrompt` currently mutate `prompts` with no `withAudit`/`record()` call, unlike every sibling mutation in this BC (confirmed against `CONTRACT.md`'s own "Events Published" table, which lists neither). Both become real, audited mutations here, since this feature is their first production caller. The new `reactivatePrompt`, project-subscriber grants, and `project_repos` CRUD are all built audited from the start, matching every other mutation in this BC.
- **VII. Feature-Gated by Entitlement (G1)**: Satisfied by composition, not a new gate — every route lives under `src/app/(app)/`, whose `layout.tsx` already calls `resolveAppShellAccess()` (checks `coreFeaturesEnabled`, defaults `true` for both tiers) before any child route renders. No new entitlement key is needed for this feature.

**Result**: PASS. No violations requiring Complexity Tracking justification.

**Post-design re-check** (after Phase 1): `data-model.md`'s new types (`ProjectRepo`, the widened `SubscriberType`) and the new `authorize-owner-action.ts` branch stay entirely inside `prompt-registry`; the two audit fixes reuse the existing `withAudit`/`record` pattern verbatim. No new bounded context, no new cross-BC surface beyond the `ProjectIdentityVerifier` composition already called out under D1. Still PASS.

## Project Structure

### Documentation (this feature)

```text
specs/023-prompt-registry-views-ui/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── prompt-registry-views-ui.contract.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── app/(app)/prompts/
│   ├── page.tsx                       # Server: session auth (inherited from (app)/layout.tsx), listPrompts/listSkillsByOrganization + filters from searchParams
│   ├── prompts-list-view.tsx          # Client "View": search/filter bar, empty states, row list — pure props in
│   ├── prompts-list.tsx               # Thin client wrapper: owns useRouter/useSearchParams (debounced search per this repo's URL-filter convention), passes state to *View
│   ├── new-prompt-drawer.tsx          # Client: name/description/system+user template/tags form
│   ├── actions.ts                     # "use server": createPromptAction, publishVersionAction, rollbackPromptAction (audited), deprecatePromptAction (audited), reactivatePromptAction, subscribeSkillAction, unsubscribeSkillAction, forkSkillAction, assignSkillToProjectAction, unassignSkillFromProjectAction
│   ├── [name]/
│   │   ├── page.tsx                   # Server: getPrompt + expand() for the rendered-preview tab + project-assignment/share data
│   │   ├── prompt-detail-view.tsx     # Client "View": header, Template/Preview/Applied-policies tabs, version dropdown
│   │   ├── prompt-detail.tsx          # Thin client wrapper (router context)
│   │   ├── version-history-drawer.tsx
│   │   ├── share-drawer.tsx           # Users/Teams/Projects grant-revoke, "share to another team" picker
│   │   ├── assign-projects-drawer.tsx # None/Optional/Required per-project toggle
│   │   └── new-version-drawer.tsx     # Page-level drawer state, not a route — matches mockup's drawer-not-page pattern (see research.md)
│   └── *.test.tsx / *.test.ts
│
├── app/(app)/projects/
│   ├── page.tsx                       # Server: listProjectsByOrganization
│   ├── projects-list-view.tsx / projects-list.tsx
│   ├── new-project-drawer.tsx         # Name/team-select/lead-select/description
│   ├── actions.ts                     # "use server": createProjectAction, updateProjectAction, addProjectMemberAction, removeProjectMemberAction, addCollaboratorTeamAction, removeCollaboratorTeamAction, addProjectRepoAction, removeProjectRepoAction, assignSkillToProjectAction, unassignSkillFromProjectAction
│   ├── project-identity-verifier.ts   # First real ProjectIdentityVerifier impl, composing identity-access's getOrganization/getTeam/getUser (see research.md)
│   └── [id]/
│       ├── page.tsx                   # Server: getProject + listProjectMembers/listProjectTeams/listProjectRepos/listRequiredSkillsForProject + listSkillsByOrganization (for curation's "available" group)
│       ├── project-detail-view.tsx    # Client "View": Members/Prompts/Repositories/Teams tabs (Metrics tab intentionally omitted — see spec.md Assumptions)
│       ├── project-detail.tsx         # Thin client wrapper
│       ├── add-team-drawer.tsx
│       ├── add-member-drawer.tsx      # New — mockup's "+ add member" had no wired behavior; mirrors add-team-drawer's pattern (spec.md Assumptions)
│       └── add-repo-drawer.tsx
│   └── *.test.tsx / *.test.ts
│
├── bcs/prompt-registry/
│   ├── application/reactivate-prompt.ts          # New: mirrors deprecate-prompt.ts, sets isDeprecated:false, audited (prompt.reactivated)
│   ├── application/deprecate-prompt.ts           # Fixed: adds the withAudit/record call it was missing (prompt.deprecated)
│   ├── application/rollback-prompt.ts            # Fixed: adds the withAudit/record call it was missing (prompt.version_activated)
│   ├── application/authorize-owner-action.ts     # Extended: new "project" branch, resolves via sibling get-project.ts, delegates to the existing "team" branch on project.teamId
│   ├── application/add-project-repo.ts           # New — mirrors add-collaborator-team.ts's shape/authorization exactly
│   ├── application/remove-project-repo.ts        # New — mirrors remove-collaborator-team.ts
│   ├── application/list-project-repos.ts         # New — mirrors list-project-teams.ts (pure read)
│   ├── application/list-prompts.ts               # Extended: accessible-set also includes prompts subscribed-to by any project the caller is a member of
│   ├── domain/subscription.ts                    # SubscriberType widened to "user" | "team" | "project" (OwnerType, used by fork/prompt ownership, stays "user" | "team" — unchanged)
│   ├── domain/project-repo.ts                    # New: ProjectRepo type + DuplicateProjectRepoError/ProjectRepoNotFoundError
│   ├── infrastructure/schema.ts                  # +projectRepos table; subscriptions.subscriberType TS enum literal widened (no migration — plain text column)
│   ├── infrastructure/project-repos-repo.ts      # New
│   ├── infrastructure/project-members-repo.ts    # +listProjectIdsForUser(db, userId) — powers the accessible-set extension
│   ├── infrastructure/prompts-repo.ts            # listAccessibleByOwnerAndSubscriptions extended to accept the caller's project ids
│   ├── index.ts                                  # +reactivatePrompt, +addProjectRepo/removeProjectRepo/listProjectRepos exports
│   └── CONTRACT.md                               # Document all of the above; OWNERSHIP.md already lists src/app/(app)/prompts/*,/projects/* — no change needed there
└── drizzle/migrations/
    └── <timestamp>_prompt_registry_project_repos.sql   # New table + RLS, renamed per this repo's migration-naming convention
```

**Structure Decision**: Single unified Next.js app. Pages and their client components live under `src/app/(app)/prompts/` and `src/app/(app)/projects/`, following the exact `page.tsx` (server) → `*-view.tsx`/`*-list.tsx`/`*-detail.tsx` (client, View/wrapper split) pattern already established by `settings/audit-log` and `teams`. New *business* logic (the three new capabilities, the two audit fixes, the accessible-set query extension) lives inside `src/bcs/prompt-registry/`, since it's domain logic this BC already owns (D1) — the UI route layer only composes it. `project-identity-verifier.ts` is the one new piece of cross-BC composition, and it lives in the route folder (not inside `prompt-registry`) because it's Distribution-layer wiring between two BCs' public contracts, not new domain logic in either.

## Complexity Tracking

> No Constitution Check violations — this section is intentionally empty.
