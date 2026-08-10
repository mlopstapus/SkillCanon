---
description: "Task list for 034-project-scoped-governance-ui"
---

# Tasks: Project-Scoped Governance UI

**Input**: Design documents from `/specs/034-project-scoped-governance-ui/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/list-objectives-by-project.md, quickstart.md

**Tests**: Included — matches this repo's established convention (every source file has a sibling `.test.ts(x)`; see CLAUDE.md).

**Organization**: Tasks are grouped by user story (US1 = View, US2 = Author) per spec.md.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2)

---

## Phase 1: Setup

- [X] T001 Create and check out git branch `034-project-scoped-governance-ui` from `origin/main` (per this repo's established convention of not landing speckit work directly on `main`), and push with `-u` to set upstream tracking.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The one new backend capability both user stories depend on for real data — a project's local objectives must be listable before either "view" (US1) or "the list a create/edit/delete acts on" (US2) can be built or tested against real data.

**Implementation-time correction (2026-08-09):** while starting T002, discovered `listProjectObjectives(db, actor, projectId)` already exists at `src/bcs/governance/application/list-project-objectives.ts`, is already exported from the barrel (`src/bcs/governance/index.ts`), already has a Testcontainers-backed test (`list-project-objectives.test.ts`, confirms project-only filtering + creation-order), and is already documented in `CONTRACT.md`'s Exposed APIs table (`listProjectObjectives(orgId, projectId)` — "A project's own directly-assigned objectives"). This function does exactly what `research.md`'s "Decision: Add one new read function" called for — the research during `/speckit-plan` simply missed it in an earlier, incomplete barrel scan. It was deleted as a duplicate rather than kept. **T002-T005 below are all no-ops**, kept for traceability; every later task that referenced the (never-built) `listProjectObjectives` now uses `listProjectObjectives` instead.

- [X] T002 No-op — `listProjectObjectives` already exists with the exact intended shape. No new file created (the duplicate written before this discovery was deleted).
- [X] T003 No-op — already exported from `src/bcs/governance/index.ts:38`.
- [X] T004 No-op — already covered by `list-project-objectives.test.ts` (creation-order + project-only filtering, excludes team-only objectives in the same fixture). Cross-org isolation and empty-array cases aren't separately asserted but are structurally guaranteed by the underlying query's `where(organizationId AND projectId AND status)` shape — not worth a redundant new test.
- [X] T005 No-op — already documented in `CONTRACT.md`'s Exposed APIs table.

**Checkpoint**: `listProjectObjectives` exists, is exported, is tested, and is documented — both user stories can now build on real data.

---

## Phase 3: User Story 1 - View a project's local objectives (Priority: P1) 🎯 MVP

**Goal**: An admin (or any project member) can open a project's detail page, click a new "Governance" tab, and see every objective defined locally for that project — or a clear empty state if there are none.

**Independent Test**: Open any project's detail page, click the Governance tab, and confirm local objectives render (or the empty state renders for a project with none) — no create/edit/delete controls are required to be functional yet for this story to be considered independently testable (US2 adds those).

### Tests for User Story 1

- [X] T006 [P] [US1] Add structural + axe test cases to `src/app/(app)/projects/[id]/project-detail-view.test.tsx` for the new Governance tab: renders the tab label with a count badge; renders each objective's title/description when `data.objectives` is non-empty; renders the `AppState` empty-state variant when `data.objectives` is empty; zero critical/serious axe violations on both states (matches this repo's `expectNoCriticalOrSeriousAxeViolations` convention — see `src/shared/testing/accessibility.ts` and any sibling tab's existing axe test for the exact call pattern).

### Implementation for User Story 1

- [X] T007 [US1] Add `objectives: Array<{ id: string; title: string; description: string | null }>` to the `ProjectDetailData` interface in `src/app/(app)/projects/[id]/project-detail-view.tsx` (per data-model.md's UI-layer type).
- [X] T008 [US1] Add `"governance"` to the `ProjectDetailTab` union in `src/app/(app)/projects/[id]/project-detail-view.tsx`, add the tab button (label "Governance", count badge from `data.objectives.length`) alongside the existing Metrics/Members/Prompts/Repositories/Teams tabs, and add the tab's content panel: a scrollable local-objectives list (title + description per row, each row clickable — no inline edit affordance needed structurally yet, that's wired in US2) when non-empty, or `AppState variant="empty"` (title/description explaining the project has no objectives of its own yet) when empty. No inherited-objectives section, no policy content anywhere on this tab (per spec.md FR-002).
- [X] T009 [US1] In `src/app/(app)/projects/[id]/page.tsx`, call `listProjectObjectives` (wrapped in `withTenantContext`, matching how every other field on `ProjectDetailData` is already fetched on this page) and populate the new `objectives` field.
- [X] T010 [US1] Run `pnpm vitest run 'src/app/(app)/projects/[id]/project-detail-view.test.tsx'` and confirm the new tests from T006 pass.

**Checkpoint**: User Story 1 is fully functional and independently testable — a project's local objectives are visible (or a correct empty state renders), with zero new accessibility violations.

---

## Phase 4: User Story 2 - Author a local objective for a project (Priority: P1)

**Goal**: An admin can create, edit, and delete objectives scoped to exactly one project, from that project's own Governance tab — with no effect on any other project or team.

**Independent Test**: From a project's Governance tab, create an objective, confirm it appears immediately, edit it, confirm the change persists, delete it, confirm it's gone — and confirm none of this affected a second project or the project's owning team's own governance page.

### Tests for User Story 2

- [X] T011 [P] [US2] No new test needed — confirmed `src/bcs/governance/application/create-objective.test.ts` already covers project-scoped creation end-to-end, including a cross-org `projectId` rejection case. Just run `pnpm vitest run src/bcs/governance/application/create-objective.test.ts` once at the start of this phase as a baseline (it should already pass, unmodified by this feature) — a genuine no-op task, kept here for traceability rather than silently skipped.
- [X] T012 [P] [US2] Add structural test cases to `src/app/(app)/teams/[teamId]/objective-drawer.test.tsx` for `scopeKind="project"`: renders the "does not cascade to anyone else" copy (same branch as `"person"`), accepts and displays a project `scopeLabel`.
- [X] T013 [P] [US2] No dedicated test file for `src/app/(app)/projects/actions.ts` — confirmed no `"use server"` action file anywhere in this app has direct test coverage (checked: no `actions.test.ts` exists at any route). Server actions in this codebase are thin wrappers; coverage comes from T011 (the underlying `createObjective` BC function) plus T012/T006's UI-layer tests. This task is a no-op placeholder documenting that decision — do not invent a new `actions.test.ts` convention this feature would be the only user of.

### Implementation for User Story 2

- [X] T014 [US2] Widen `scopeKind: "team" | "person"` to `"team" | "person" | "project"` in the `ObjectiveDrawerProps` interface, `src/app/(app)/teams/[teamId]/objective-drawer.tsx` — no other change needed inside the component (the existing `scopeKind === "team" ? ... : ...` ternary's `else` branch already produces correct copy for `"project"`, per research.md).
- [X] T015 [US2] In `src/app/(app)/projects/actions.ts`, add a `makeObjectiveScopeVerifier(tx)` factory implementing `ObjectiveScopeVerifier` with only `projectBelongsToOrganization: async (orgId, projectId) => Boolean(await getProject(tx, orgId, projectId))` (checks for a non-null/truthy return, not try/catch, since `getProject` returns `null` rather than throwing — no `teamBelongsToOrganization`/`userBelongsToOrganization` needed, since this page only ever sets `projectId`). **Implementation-time find:** an REST-layer twin of exactly this adapter already exists at `src/app/api/projects/[projectId]/objectives/route.ts`'s own `makeObjectiveScopeVerifier` — mirror it verbatim (same shape, same doc-comment style), don't import it directly (route-layer code, separate from this UI-layer file, per the established "each layer gets its own small copy" convention already noted in research.md).
- [X] T016 [US2] In `src/app/(app)/projects/actions.ts`, add `createProjectObjectiveAction`, `updateProjectObjectiveAction`, `deleteProjectObjectiveAction` — each wraps the existing `createObjective`/`updateObjective`/`deleteObjective` (from `@/bcs/governance`) in `withTenantContext`, resolves the acting user the same way the file's other actions already do, passes `{ projectId, title, description }` and the T015 verifier, and returns `GovernanceActionResult`-shaped results (mirror `src/app/(app)/teams/[teamId]/actions.ts`'s `createObjectiveAction`/`updateObjectiveAction`/`deleteObjectiveAction` exactly, adapted for project scope instead of team/person scope).
- [X] T017 [US2] In `src/app/(app)/projects/[id]/project-detail.tsx`, add objective-drawer state (open/closed, `mode: "create" | "edit"`, `initialValues`) and handlers wired to the T016 actions, calling `router.refresh()` on success — mirror the existing `addTeamOpen`/`AddTeamDrawer`/`addCollaboratorTeamAction` wiring in the same file exactly.
- [X] T018 [US2] In `src/app/(app)/projects/[id]/project-detail-view.tsx`'s Governance tab (from T008), add the "New objective" button (visible to **every** viewer, per the 2026-08-09 `/speckit-analyze` correction to FR-006 — matches the existing, unconditional "+ add team"/"+ add member"/"+ add repository" buttons on this same page and the team-scoped governance page's own "New objective" button; a non-admin's submission is rejected server-side by the existing, unchanged `assertCanManageObjective` check and surfaces via `ObjectiveDrawer`'s existing `error` state, same as every other action on this page) and make each local-objective row clickable to open the drawer in edit mode with its current values, plus a delete (×) control — wire `onOpenAddObjective`/`onEditObjective`/`onRemoveObjective` props through from `project-detail.tsx` (T017), matching the existing `onOpenAddTeam`/`onRemoveTeam` prop-drilling pattern in the same two files. Do **not** add a new `viewerIsAdmin`/role-gating field to `ProjectDetailData` — no such field exists anywhere on this page today and this feature should not be the first to introduce one.
- [X] T019 [US2] Render `<ObjectiveDrawer scopeKind="project" .../>` from `project-detail.tsx` when the T017 drawer state is open, importing it from `../../teams/[teamId]/objective-drawer` (existing component, no new file).
- [X] T019a [US2] Manually verify (as part of T022's quickstart pass, or standalone) that a non-admin's rejected create/edit/delete attempt surfaces `ObjectiveDrawer`'s existing error message rather than failing silently — very likely already correct by construction (T016's actions already return `{ok:false, error}` on rejection, and the drawer already renders `error` state), but not yet explicitly confirmed for the project scope specifically.
- [X] T020 [US2] Run `pnpm vitest run src/bcs/governance/application/create-objective.test.ts 'src/app/(app)/teams/[teamId]/objective-drawer.test.tsx' 'src/app/(app)/projects/[id]/project-detail-view.test.tsx'` and confirm all pass, including the new US2 cases from T011-T012.

**Checkpoint**: Both user stories are fully functional. An admin can view, create, edit, and delete project-scoped objectives entirely from the project's own page; a non-admin can view but not mutate.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T021 [P] Run `pnpm typecheck` and `pnpm lint` at the repo root — confirm the widened `ObjectiveDrawer.scopeKind` union and the new `ProjectDetailData.objectives` field don't break any other caller.
- [X] T022 Manually run through `specs/034-project-scoped-governance-ui/quickstart.md`'s six scenarios against a local dev stack; record any deviations.
- [X] T023 Run the full focused test set for every file touched by this feature in one pass (`pnpm exec vitest run` scoped to the files listed across T004, T006, T011-T013) plus a broader sanity pass (`pnpm vitest run` on the documented fast unit suite from `.claude/anchorstack/project.md`) to catch any cross-file regression before `/as-finish`'s own full integration-suite gate.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup. Blocks both user stories — neither can be meaningfully tested against real data without `listProjectObjectives`.
- **User Story 1 (Phase 3)**: Depends on Foundational (T002-T003 specifically, for T009). Independent of User Story 2 — a project's objectives are viewable even before create/edit/delete UI exists (they'd just need to be seeded another way, e.g. directly via `createObjective` in a test, to verify US1 alone).
- **User Story 2 (Phase 4)**: Depends on Foundational. Builds UI *on top of* US1's tab (T008) — in practice, implement US1 first so there's a tab to add the button/rows to, even though the two stories are conceptually independent per spec.md.
- **Polish (Phase 5)**: Depends on both user stories being complete.

### Parallel Opportunities

- T002 and T004 (Foundational) can be worked on together once T002's signature is agreed, though T004 needs T002's implementation to exist to run against.
- T006, T011, T012, T013 (test-writing across four different files) can all be done in parallel.
- T021 can run any time after both user stories' implementation tasks land.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) and Phase 2 (Foundational).
2. Complete Phase 3 (User Story 1) — a working, tested "view a project's objectives" tab.
3. **STOP and VALIDATE**: run quickstart.md's Scenario 1 manually (empty state) plus T010's test pass. This alone is a real, demoable increment (an admin can now confirm what's already been set up on a project by direct DB/API means, even before this feature adds a UI way to create one).
4. Continue to Phase 4 (User Story 2) to complete the feature per spec.md's actual acceptance criteria (view AND author).

### Full Delivery

1. Setup → Foundational → User Story 1 → User Story 2 → Polish, in that order (matches the natural UI-build-out dependency, not just the priority ordering — both stories are P1, but US1's tab scaffold is a practical prerequisite for US2's buttons/rows to attach to).
2. Run `/speckit-analyze` after this tasks.md is generated and before implementation starts, per the standing loop.
