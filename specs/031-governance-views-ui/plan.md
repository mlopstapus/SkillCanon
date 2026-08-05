# Implementation Plan: Governance Views UI

**Branch**: `031-governance-views-ui` | **Date**: 2026-08-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/031-governance-views-ui/spec.md`

## Summary

Build the real `src/app/(app)/teams/[teamId]/{policies,objectives}` pages, ported from the `SkillCanon Governance.dc.html` Claude Design mockup, composed into the existing app shell (the nav's "Governance" link already points at `/teams/{teamId}/policies`, currently 404). This is the first real UI caller of governance's create/update/delete write operations (already built and tested, but only ever exercised from unit tests today). The bulk of new work: (1) a scope-tree sidebar covering both team and person nodes, reusing `teams-explorer.tsx`'s already-correct depth-first tree-ordering algorithm extended with interleaved person leaf-nodes; (2) a genuine backend gap found while planning — `resolveEffectivePolicies`/`resolveEffectiveObjectives` always resolve relative to a specific `userId` (deriving the team chain from `user.teamId`), so there is no way to resolve "effective governance for team X" when a bare team node is the selected scope, not a specific person. Two small new application functions (`resolveEffectivePoliciesForTeam`, `resolveEffectiveObjectivesForTeam`) close this gap, mirroring the existing functions' logic but starting the chain walk directly from a `teamId`; (3) the policy-authoring drawer offers all four real `enforcementType` values per the spec's Clarifications, one more than the mockup's three; (4) policy creation/editing is restricted to team scope only (`policies.teamId` is `NOT NULL`), enforced both in the UI and server-side.

## Technical Context

**Language/Version**: TypeScript 5, Next.js 16 (App Router), React 19

**Primary Dependencies**: Drizzle ORM (`postgres-js` driver), Tailwind v4 (`@theme inline`, no `tailwind.config.ts`), `src/shared/ui` (Badge, Table, `cn()` — no dedicated Drawer/Tabs primitive exists, matching `023-prompt-registry-views-ui`'s own finding; build page-local drawer/tab components), `src/bcs/governance` (`resolveEffectivePolicies`/`resolveEffectiveObjectives` for a person scope, the two new `*ForTeam` functions for a team scope, `resolveAllPolicies`, `createPolicy`/`updatePolicy`/`deletePolicy`, `createObjective`/`updateObjective`/`deleteObjective`), `src/bcs/identity-access` (`authenticateSession` — inherited from `(app)/layout.tsx`, `listTeams`, `getTeamChain`, `listUsers` — for building the scope tree's person rows)

**Storage**: PostgreSQL via the existing `governance` schema — no schema change; the two new application functions are pure reads composing existing repo queries (`listActiveByTeam`) with `getTeamChain`, exactly like the existing user-scoped functions do

**Testing**: Vitest — Testcontainers-backed tests for the two new application functions and any modified ones, `renderToStaticMarkup`-only tests for React components (no jsdom/click-simulation) per this repo's established convention

**Target Platform**: Server-rendered Next.js App Router pages within the existing `(app)` route group, self-hosted via Docker Compose or the existing CI/CD pipeline

**Project Type**: Web application — single unified Next.js app (per `docs/context/repo-structure.md`); no separate frontend/backend split

**Performance Goals**: No new performance envelope — org-scoped hierarchy/catalog-sized lists (teams, users, policies, objectives per scope), not unbounded event logs; no pagination precedent exists for comparably-sized lists elsewhere (`teams-explorer`) and none is warranted here

**Constraints**: Every mutating action (create/update/delete policy or objective) must be gated server-side by the same authorization the application layer already enforces, never only hidden in the UI (FR-008); a `"use client"` component must never import a real (non-type) value from `@/bcs/governance`'s barrel directly (drags server-only deps into the browser bundle, this repo's documented gotcha) — all BC calls happen in `page.tsx` (server) or `actions.ts` (`"use server"`); policy creation/edit must reject a person-scoped attempt server-side, not only hide the button client-side (FR-005/FR-007a)

**Scale/Scope**: One page tree (`teams/[teamId]/{policies,objectives}`, sharing a scope-tree sidebar and tab shell), 2 new governance application functions (`resolveEffectivePoliciesForTeam`, `resolveEffectiveObjectivesForTeam`), ~2 drawers (policy, objective — distinct forms, not a shared generic drawer given policies have enforcement-mode/priority fields objectives don't), 1 scope-tree component extending `teams-explorer.tsx`'s tree-ordering algorithm with person nodes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Test-First (P1)**: `resolveEffectivePoliciesForTeam`/`resolveEffectiveObjectivesForTeam` each get a Testcontainers-backed test before/alongside implementation, per `tasks.md`. Every route/action wiring gets a `renderToStaticMarkup` test matching this repo's established UI-testing convention.
- **II. Domain-Driven Bounded Contexts (D1)**: All new UI composes `governance` and `identity-access` exclusively through their public barrels. The two new functions live inside `governance/application/`, not composed ad hoc in the route layer — matching where their sibling user-scoped functions already live.
- **III. Domain Invariants in Domain Layer (D2)**: The "policies are team-only" rule (FR-005/FR-007a) is enforced inside `createPolicy`/`updatePolicy` themselves if not already (verify during Phase 0 research — `policies.teamId` being `NOT NULL` at the DB level already makes a person-scoped attempt fail, but confirm the application layer rejects it with a clear domain error rather than a raw DB constraint violation surfacing to the UI).
- **IV. Multi-Tenant Isolation (M1-M3)**: No new tables. The two new functions take an org-scoped `actor` exactly like their user-scoped siblings and must never trust a path-supplied `teamId` alone — verify the team belongs to the actor's organization before resolving its chain (mirroring `getTeamChain`'s own existing org-scoping).
- **V. Secure by Default (S1-S3)**: No new secret-handling surface, no new template-rendering path.
- **VI. Auditable & Compliant (C1-C2)**: `createPolicy`/`updatePolicy`/`deletePolicy`/`createObjective`/`updateObjective`/`deleteObjective` are already audited per `CONTRACT.md`'s Events Published table (`PolicyCreated`/`PolicyUpdated`/`PolicyDeactivated`, `ObjectiveCreated`/`ObjectiveUpdated`/`ObjectiveDeleted`) — this feature is their first production caller, so confirm those audit writes actually fire end-to-end via this UI, not just re-verify the unit-level behavior. The two new resolution functions are pure reads, no audit write needed (matching their user-scoped siblings, which are also unaudited reads).
- **VII. Feature-Gated by Entitlement (G1)**: Satisfied by composition — every route lives under `src/app/(app)/`, whose `layout.tsx` already calls `resolveAppShellAccess()` (`coreFeaturesEnabled`, default `true` both tiers). No new entitlement key needed.

**Result**: PASS. No violations requiring Complexity Tracking justification.

**Post-design re-check** (after Phase 1): `data-model.md`'s two new function signatures stay entirely inside `governance/application/`, reusing existing `listActiveByTeam`/`getTeamChain` composition — no new cross-BC surface, no schema change. Still PASS.

## Project Structure

### Documentation (this feature)

```text
specs/031-governance-views-ui/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── governance-views-ui.contract.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/bcs/governance/application/
├── resolve-effective-policies-for-team.ts    # New: mirrors resolve-effective-policies.ts, keyed by teamId not userId
├── resolve-effective-policies-for-team.test.ts
├── resolve-effective-objectives-for-team.ts  # New: mirrors resolve-effective-objectives.ts, keyed by teamId not userId
└── resolve-effective-objectives-for-team.test.ts

src/bcs/governance/index.ts                    # Export the two new functions

src/app/(app)/teams/[teamId]/
├── policies/
│   ├── page.tsx                      # Server: resolve scope (team or ?person= query param), call the right resolve* function, build scope-tree data
│   ├── governance-view.tsx           # Client "View": scope-tree sidebar + Policies/Objectives tabs + Inherited/Local sections — pure props in, shared by both routes via a `tab` prop
│   ├── governance-page.tsx           # Thin client wrapper: owns router/searchParams for scope selection and tab switching (no full navigation, per FR-013/FR-014)
│   ├── scope-tree.tsx                # Team+person hierarchy list, extends teams-explorer.tsx's treeOrder/depthOf/chainRootFirst pattern with interleaved person rows
│   ├── policy-drawer.tsx             # Create/edit form: name, enforcement (4-way segmented control), priority, content
│   ├── objective-drawer.tsx          # Create/edit form: name, content (team or person scope, no enforcement/priority fields)
│   ├── actions.ts                    # "use server": createPolicyAction, updatePolicyAction, deletePolicyAction, createObjectiveAction, updateObjectiveAction, deleteObjectiveAction
│   └── *.test.tsx / *.test.ts
└── objectives/
    └── page.tsx                      # Server: same as policies/page.tsx with tab="objectives" — thin, delegates to the same governance-view.tsx
```

**Structure Decision**: Two thin route files (`policies/page.tsx`, `objectives/page.tsx`) share one real view component (`governance-view.tsx`) via a `tab` prop, matching this repo's established "server page resolves data, client `*-view.tsx` renders, thin client wrapper owns router state" three-layer pattern (`teams-explorer.tsx`, `prompts-list-view.tsx`/`prompts-list.tsx`). The scope-tree component is page-local (`src/app/(app)/teams/[teamId]/scope-tree.tsx`), not extracted into `src/shared/ui`, since it's specific to this feature's team+person hierarchy shape — `teams-explorer.tsx`'s tree-ordering *algorithm* is reused (copied and extended, not imported, since it's a small pure function embedded in a page-local component file, not a shared export).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |

## Phase 0: Research

See [research.md](./research.md).

## Phase 1: Design & Contracts

See [data-model.md](./data-model.md), [contracts/governance-views-ui.contract.md](./contracts/governance-views-ui.contract.md), and [quickstart.md](./quickstart.md).
