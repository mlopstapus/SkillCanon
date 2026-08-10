# Implementation Plan: Project-Scoped Governance UI

**Branch**: `034-project-scoped-governance-ui` | **Date**: 2026-08-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/034-project-scoped-governance-ui/spec.md`

## Summary

Add a "Governance" tab to the project detail page (`/projects/[id]`) that lists a project's own local objectives and lets an admin create, edit, and delete them. No team-inherited objectives display and no policy content, per the 2026-08-09 clarification recorded in spec.md. The write path (`createObjective`/`updateObjective`/`deleteObjective`, project-scope authorization) already exists and is unmodified; this feature adds one small new read function to `governance` and wires the existing `ObjectiveDrawer` component + a new project-page tab on top of it.

## Technical Context

**Language/Version**: TypeScript 5, Next.js 16 (App Router), React 19

**Primary Dependencies**: `@/bcs/governance` (`createObjective`, `updateObjective`, `deleteObjective`, existing; new `listProjectObjectives`), `@/bcs/prompt-registry` (`getProject`, existing — used as the scope-verifier's identity check), `@/shared/db` (`withTenantContext`), `@/shared/ui` (`Drawer`, `AppState`)

**Storage**: PostgreSQL via Drizzle — `governance.objectives` (existing table, existing `project_id` column; no schema change)

**Testing**: Vitest — `renderToStaticMarkup` structural + axe tests for the new UI (matches every other view/drawer in this repo); Testcontainers-backed application-layer test for the one new governance function

**Target Platform**: Web (self-hosted Next.js app, existing `(app)` route group)

**Project Type**: Web application (single unified Next.js app — no separate frontend/backend split)

**Performance Goals**: N/A — a low-traffic admin CRUD surface, same shape as every other project-detail tab

**Constraints**: Must follow `eslint-plugin-boundaries` BC ownership rules (D1) — the project detail page (owned by `prompt-registry`) may only reach `governance`'s functionality through its exported barrel, never its internals; `governance` may not reach into `prompt-registry`'s `projects` table directly (uses the existing `ObjectiveScopeVerifier.projectBelongsToOrganization` callback pattern instead, same as the team-scoped page already does for `teamBelongsToOrganization`)

**Scale/Scope**: One new governance read function, one new project-page tab + one new page-level server-action trio (create/update/delete), one drawer-component scope-kind extension (`"team" | "person"` → `"team" | "person" | "project"`). No new database table or column.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|---|---|
| II. Domain-Driven Bounded Contexts (D1) | **Pass.** `prompt-registry`'s project page calls `governance`'s exported functions only (`createObjective`/`updateObjective`/`deleteObjective`/new `listProjectObjectives`); it never imports governance internals. Governance verifies the project exists via a caller-supplied `projectBelongsToOrganization` callback (wired in the project page's own `actions.ts`, calling `prompt-registry`'s exported `getProject`) — mirrors the exact adapter pattern `makeObjectiveScopeVerifier`/`makeProjectIdentityVerifier` already established for `teamBelongsToOrganization`/`userBelongsToOrganization`. No new cross-BC coupling shape is introduced. |
| III. Domain Invariants Live in the Domain Layer (D2) | **Pass.** Project-scope authorization (`assertCanManageObjective`'s existing org-admin-only branch for `projectId !== null`) already lives in governance's application layer, not this feature's UI code — this feature calls it, doesn't reimplement it. |
| IV. Multi-Tenant Isolation (M1-M3) | **Pass.** `governance.objectives` is already RLS-protected and already org-scoped via `actor.organizationId` on every existing function this feature calls. The one new read function (`listProjectObjectives`) takes `organizationId` + `projectId` and filters by both, matching `listActiveByProject`'s existing repo-level query — no new tenant-scoping surface. Callers (the new server actions) wrap the call in `withTenantContext`, per the established codebase-wide convention — `governance` itself never calls `withTenantContext`. |
| VIII. Consistent, Accessible UI (U1-U7) | **Pass.** Dark-only `(app)` route group (U1) — unaffected, no new theme context. Design tokens (U2) — new markup reuses existing Tailwind/CSS-variable classes, no hardcoded literals. `AppState` for the tab's empty state (U3, U8/FR-007). Focus-visible (U4) — inherited for free from the reused `ObjectiveDrawer`/`Drawer` primitive. Shared primitive reuse, not a new hand-rolled pattern (U5) — extends `ObjectiveDrawer`'s existing `scopeKind` union rather than building a new drawer. Mobile-responsive (U6) — inherited from the existing project-detail-page shell/tab-bar pattern, unchanged by this feature. Axe test (U7) — a new `axe-core` check is added for the Governance tab's rendered markup, matching the sibling tabs' own test convention. |
| VII. Feature-Gated by Entitlement (G1) | **N/A, matches sibling scope precedent.** No entitlement key exists for objectives/governance authoring at any scope today (team- or person-scoped objective creation, already shipped, has no entitlement gate either) — this feature stays consistent with that existing precedent rather than introducing a new, orphaned gate that no sibling feature has. Not a gap this feature should silently invent a fix for. |

No violations requiring justification — Complexity Tracking section is empty.

## Project Structure

### Documentation (this feature)

```text
specs/034-project-scoped-governance-ui/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── list-objectives-by-project.md
└── tasks.md             # Phase 2 output (/speckit-tasks — not created by this command)
```

### Source Code (repository root)

```text
src/bcs/governance/
└── application/
    ├── list-project-objectives.ts       # EXISTING, unmodified — already does exactly what this feature needs
    │                                      #   (found during implementation; plan/research originally assumed
    │                                      #   this needed to be built new — see tasks.md's Phase 2 correction note)
    └── list-project-objectives.test.ts  # EXISTING, unmodified — already has adequate coverage

src/app/(app)/projects/
├── actions.ts                              # MODIFIED — add createProjectObjectiveAction/updateProjectObjectiveAction/deleteProjectObjectiveAction + makeObjectiveScopeVerifier (project-capable)
└── [id]/
    ├── page.tsx                            # MODIFIED — fetch objectives, pass into ProjectDetailData
    ├── project-detail.tsx                  # MODIFIED — add objective-drawer open/mode state + handlers, mirrors existing add-team/add-member/add-repo wiring
    ├── project-detail-view.tsx             # MODIFIED — add "Governance" tab, ProjectDetailData.objectives field, tab content (AppState empty state + local objective rows)
    ├── project-detail-view.test.tsx        # MODIFIED — new tab's structural + axe assertions
    └── (reused, unmodified) ../../teams/[teamId]/objective-drawer.tsx  # scopeKind extended to include "project"
```

**Structure Decision**: Single unified Next.js app (existing `src/` layout, no new top-level directory). Follows the identical file-layout precedent the team-scoped objectives feature (`031-governance-views-ui`) already established — one new small governance application function, page-level server actions in the owning route group's `actions.ts`, and reuse of the existing shared drawer component with an extended scope-kind union.

## Complexity Tracking

*No entries — Constitution Check has no unjustified violations.*
