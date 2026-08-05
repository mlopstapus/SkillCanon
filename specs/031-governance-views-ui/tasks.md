# Tasks: Governance Views UI

**Input**: Design documents from `/specs/031-governance-views-ui/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/governance-views-ui.contract.md, quickstart.md

**Tests**: Required by this repo's constitution (Test-First, Principle I) and established convention — Testcontainers-backed tests for new/changed application-layer functions, `renderToStaticMarkup`-only tests for React components.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Path Conventions

Single unified Next.js app at the repo root (`src/`), per `docs/context/repo-structure.md`. New routes live under `src/app/(app)/teams/[teamId]/{policies,objectives}/`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup

**Purpose**: Verify existing wiring this feature composes into.

- [X] T001 Verify `src/app/(app)/_components/nav-model.ts`'s `governanceRoutePattern` (`/teams/[teamId]/(policies|objectives)`) and the "Governance" nav link (`href: /teams/{teamId}/policies`) compose correctly with this feature's planned routes, and that the `(app)` route group's `resolveAppShellAccess()` layout gate already covers them — no code change expected, verification only

**Checkpoint**: Prerequisites confirmed — proceed to foundational work.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The two new governance application functions every user story's page needs to resolve a team-scoped view.

- [X] T002 [P] Implement `resolveEffectivePoliciesForTeam(db, actor, teamId)` (mirrors `resolve-effective-policies.ts`, starts the chain walk directly from `teamId` via `getTeamChain`, verifies `teamId` belongs to `actor.organizationId`, no user lookup) + test in `src/bcs/governance/application/resolve-effective-policies-for-team.ts` / `.test.ts`
- [X] T003 [P] Implement `resolveEffectiveObjectivesForTeam(db, actor, teamId)` (mirrors `resolve-effective-objectives.ts`, team-chain walk only — no per-user or per-project branches) + test in `src/bcs/governance/application/resolve-effective-objectives-for-team.ts` / `.test.ts`
- [X] T004 Export both new functions from `src/bcs/governance/index.ts`; update `CONTRACT.md`'s Exposed APIs table with both rows (depends on T002, T003)

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 - See effective governance for a team or person (Priority: P1) 🎯 MVP

**Goal**: Viewing a single scope's Policies and Objectives, inherited vs. local, both team and person scope.

**Independent Test**: `pnpm test src/app/\(app\)/teams/\[teamId\]` plus manually navigating to `/teams/{teamId}/policies` and `/objectives` and confirming both sections render correctly for a team scope and (via `?person=`) a person scope.

### Tests for User Story 1

- [X] T005 [P] [US1] Add render tests for `governance-view.tsx` covering: inherited section with source-team attribution, local section, empty-state local section, Policies/Objectives tab switching, in `src/app/(app)/teams/[teamId]/governance-view.test.tsx`

### Implementation for User Story 1

- [X] T006 [US1] Implement server page `src/app/(app)/teams/[teamId]/policies/page.tsx`: resolve scope (route `teamId`, or `?person=<userId>` verified to belong to the org via existing identity-access reads), call `resolveEffectivePoliciesForTeam` or `resolveEffectivePolicies` accordingly, `resolveAllPolicies`-derived counts (depends on T002)
- [X] T007 [US1] Implement server page `src/app/(app)/teams/[teamId]/objectives/page.tsx`: same scope-resolution as T006 with `resolveEffectiveObjectivesForTeam`/`resolveEffectiveObjectives` (depends on T003)
- [X] T008 [P] [US1] Implement `governance-view.tsx` — pure "View": scope header (avatar/label/kind pill/breadcrumb), Policies/Objectives tabs with count badges, Inherited section (priority #, enforcement-mode badge, name, source team, content), Local section (edit/delete icon buttons, empty state with explanatory copy) in `src/app/(app)/teams/[teamId]/governance-view.tsx`
- [X] T009 [US1] Implement thin client wrapper `governance-page.tsx` (owns `useRouter`/`useSearchParams` for `?tab=`/`?person=` — no full navigation on switch, per FR-013/FR-014) in `src/app/(app)/teams/[teamId]/governance-page.tsx`; wire both `policies/page.tsx` and `objectives/page.tsx` (T006, T007) to render it with the correct initial `tab` (depends on T006, T007, T008)

**Checkpoint**: User Story 1 is complete when a single team or person scope's effective policies/objectives display correctly, inherited vs. local, both tabs.

---

## Phase 4: User Story 2 - Author and remove a local policy or objective (Priority: P1)

**Goal**: Create, edit, and delete local policies (team-scope only) and objectives (team or person scope).

**Independent Test**: Creating a new local policy at a team scope, confirming it appears in Local immediately and in a descendant's Inherited section, then editing and deleting it.

### Tests for User Story 2

- [X] T010 [P] [US2] Add render tests for `policy-drawer.tsx` (create + edit mode, all four enforcement-mode options, validation) in `src/app/(app)/teams/[teamId]/policy-drawer.test.tsx`
- [X] T011 [P] [US2] Add render tests for `objective-drawer.tsx` (create + edit mode, team and person scope) in `src/app/(app)/teams/[teamId]/objective-drawer.test.tsx`

### Implementation for User Story 2

- [X] T012 [P] [US2] Implement `policy-drawer.tsx` — name, enforcement mode (4-way segmented control: prepend/append/inject/validate per Clarifications), priority, content, info callout — create and edit modes in `src/app/(app)/teams/[teamId]/policy-drawer.tsx`
- [X] T013 [P] [US2] Implement `objective-drawer.tsx` — name, content, create and edit modes, no enforcement/priority fields, works at either team or person scope in `src/app/(app)/teams/[teamId]/objective-drawer.tsx`
- [X] T014 [US2] Implement `src/app/(app)/teams/[teamId]/actions.ts`: `createPolicyAction`/`updatePolicyAction`/`deletePolicyAction` (each: auth via the same actor-resolution helper `teams/actions.ts` already uses, reused not reinvented → verify scope is a team, not a person, before calling `createPolicy`/`updatePolicy` per FR-005 → BC call → `revalidatePath`), `createObjectiveAction`/`updateObjectiveAction`/`deleteObjectiveAction` (team or person scope) + test: a caller without administrative authority over the scope is rejected by the underlying BC call, and the action surfaces that rejection as a clear error rather than swallowing it or throwing unhandled (FR-008/SC-005) (depends on T002-created barrel exports)
- [X] T015 [US2] Wire `policy-drawer.tsx` and `objective-drawer.tsx` into `governance-view.tsx`'s "New {policy|objective}" action and each local item's edit/delete buttons, disabling/hiding "New policy" when the selected scope is a person (FR-005); extend `governance-view.test.tsx` with drawer-open, person-scope-disabled, and unauthorized-action-error cases (depends on T008, T012, T013, T014)

**Checkpoint**: User Story 2 is complete when create/edit/delete work end-to-end for both policies (team-only) and objectives (team or person), with immediate reflection in descendant scopes.

---

## Phase 5: User Story 3 - Navigate the org's scope hierarchy while governing (Priority: P2)

**Goal**: The scope-tree sidebar — full hierarchy, local-item counts, filtering, click-to-switch without navigation.

**Independent Test**: Filtering the scope list to a search term, confirming matches, selecting a different scope, confirming the main panel updates without a full page reload.

### Tests for User Story 3

- [X] T016 [P] [US3] Add tests for `scope-tree.tsx`'s tree-ordering (depth-first, not alphabetical — same correctness property as `teams-explorer.tsx`'s existing fix), count-badge display, and filter behavior in `src/app/(app)/teams/[teamId]/scope-tree.test.tsx`

### Implementation for User Story 3

- [X] T017 [US3] Implement `scope-tree.tsx`: extends `teams-explorer.tsx`'s `treeOrder`/`depthOf`/`chainRootFirst` pattern with interleaved person rows per team (via `listUsers` scoped by team), local policy+objective count badge per scope (0 → no badge), filter input, `onSelect` callback in `src/app/(app)/teams/[teamId]/scope-tree.tsx`
- [X] T018 [US3] Wire `scope-tree.tsx` into `governance-page.tsx`'s scope-switching (updates `?person=` and route, no full navigation) and `governance-view.tsx`'s layout (sidebar + main panel); extend `governance-page.tsx`'s server page to compute the full hierarchy list (`listTeams`, `getTeamChain`, `listUsers`, per-scope local counts) (depends on T006, T007, T009, T017)

**Checkpoint**: User Story 3 is complete when the scope tree is fully navigable, filterable, and shows accurate local-item counts.

---

## Final Phase: Polish & Cross-Cutting Concerns

**Purpose**: Validate the feature end to end and keep documentation consistent.

- [X] T019 Run `pnpm typecheck`, `pnpm lint`, and `pnpm build` (the build step specifically to catch any Node-only import leaking into a `"use client"` component, per this repo's documented `.next/standalone` gotcha) — confirm `/teams/[teamId]/policies` and `/objectives` compile as real dynamic routes
- [ ] T020 Run the full test suite (`pnpm exec vitest run --fileParallelism=false --testTimeout=30000`, per this repo's documented reliable full-suite command) and confirm no regressions, particularly in `src/bcs/governance` and `src/app/(app)/teams`
- [ ] T021 Update `backlog/005-governance/005-governance-views-ui.md`'s frontmatter to `status: done`, check off its Requirements/Acceptance Criteria, move it to `archive/`, update `EPIC.md`'s checkbox + link and epic status
- [ ] T022 Follow up on the two features this unblocks: note in `backlog/008-distribution/003-web-ui-shell-and-core-pages.md` and `backlog/010-ui-polish-and-accessibility/001-cross-page-polish-and-accessibility.md` that the policy/objective UI gap blocking both is now closed, without marking either fully done (each has its own remaining scope)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion — blocks all user stories (every story's page needs at least one of the two new resolution functions).
- **User Stories (Phase 3+)**: US1 and US2 are both P1; implement US1 before US2 since authoring needs a working view to confirm changes against. US3 (P2) can start once US1's page/view shell exists, since it wires into the same `governance-view.tsx`/`governance-page.tsx`.
- **Polish (Final Phase)**: Depends on all three user stories being complete.

### User Story Dependencies

- **User Story 1 (P1)**: Depends on T002-T004.
- **User Story 2 (P1)**: Depends on T002-T004, T006-T009 (needs the view to wire drawers into).
- **User Story 3 (P2)**: Depends on T006, T007, T009 (needs the page/view shell to wire the scope tree into).

### Parallel Opportunities

- T002 and T003 are independent functions, different files — parallel.
- T012 and T013 (policy and objective drawers) are independent components — parallel.
- T010, T011, T016 (test files for drawers/scope-tree) can be written in parallel with each other, though each depends on its own implementation task existing to test against.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001-T004.
2. Build the view/page shell T006-T009 for a single scope (no tree navigation yet — the route's own `teamId`, or an explicit `?person=`).
3. Validate: `pnpm test src/app/\(app\)/teams/\[teamId\]`.

### Incremental Delivery

1. Deliver US1 (view a single scope).
2. Deliver US2 (author/edit/delete).
3. Deliver US3 (full hierarchy navigation, filtering, counts).
4. Run full validation, archive the backlog item, open PR.

## Notes

- Completed tasks must be marked `[X]` as implementation progresses.
- Do not build a shared generic `Drawer`/`Tabs` primitive as part of this feature — per research.md, two purpose-specific drawers stay simpler than one parameterized one, and no third UI-tree consumer exists yet to justify extracting `scope-tree.tsx`'s tree-ordering logic into `src/shared/ui`.
- Policy creation/editing must be rejected server-side (not just UI-hidden) when the scope is a person — `createPolicy`'s `CreatePolicyParams` already makes this structurally impossible (no person field exists), so T014's guard is a defense-in-depth UX check (clear error message), not the only enforcement layer.
