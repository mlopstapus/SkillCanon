# Tasks: Cross-Page Polish & Accessibility

**Input**: Design documents from `/specs/001-cross-page-polish/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Required for this UI polish pass because the spec requires automated accessibility evidence and regression protection for shared state patterns.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the existing repo structure and ignored artifacts support this UI-only work.

- [X] T001 Verify detected ignore files cover Node/Next.js outputs in `.gitignore`
- [X] T002 [P] Review existing shared UI exports in `src/shared/ui/index.ts`
- [X] T003 [P] Review global token and focus styling in `src/app/globals.css`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Create the canonical shared state primitive and documentation before route adoption.

**CRITICAL**: No page-specific state adoption can begin until this phase is complete.

- [X] T004 Add failing shared state render and axe audit tests in `src/shared/ui/app-state.test.tsx`
- [X] T005 Implement `AppState` and static axe audit helper in `src/shared/ui/app-state.tsx`, `src/shared/testing/accessibility.ts`, and `src/shared/ui/index.ts`
- [X] T006 Document canonical empty/loading/error patterns in `docs/context/design-system.md`
- [X] T007 Add global token-based focus-visible styling in `src/app/globals.css`

**Checkpoint**: Shared state and focus foundations are available for page adoption.

---

## Phase 3: User Story 1 - Standardize Cross-Page States (Priority: P1) MVP

**Goal**: Product pages use a single documented empty/error/loading presentation model with domain-specific copy only.

**Independent Test**: Render representative empty/error states and confirm they expose canonical roles, live regions, copy, and action placement.

### Tests for User Story 1

- [X] T008 [P] [US1] Add prompt/project/audit/API-key empty-state render and axe audit assertions in existing route tests under `src/app/(app)`
- [X] T009 [P] [US1] Add access-unavailable error-state render assertions in `src/app/(app)/access-unavailable.test.tsx`

### Implementation for User Story 1

- [X] T010 [US1] Replace prompt list empty-state markup with `AppState` in `src/app/(app)/prompts/prompts-list-view.tsx`
- [X] T011 [US1] Replace project list empty-state markup with `AppState` in `src/app/(app)/projects/projects-list-view.tsx`
- [X] T012 [US1] Replace audit-log empty/no-match markup with `AppState` in `src/app/(app)/settings/audit-log/audit-log-view.tsx`
- [X] T013 [US1] Replace API key empty-state markup with `AppState` in `src/app/(app)/settings/api-keys/api-keys-list.tsx`
- [X] T014 [US1] Replace access-unavailable error markup with `AppState` in `src/app/(app)/access-unavailable.tsx`

**Checkpoint**: User Story 1 is independently testable through component render tests.

---

## Phase 4: User Story 2 - Verify Accessibility and Keyboard Operation (Priority: P1)

**Goal**: Shared states and representative route controls expose accessible roles and visible focus affordances.

**Independent Test**: Run component tests plus lint/typecheck to ensure role attributes and focus CSS are present and valid.

### Tests for User Story 2

- [X] T015 [P] [US2] Assert `AppState` roles, polite live-region behavior, and zero critical/serious axe violations in `src/shared/ui/app-state.test.tsx`
- [X] T016 [P] [US2] Assert route actions remain reachable buttons/links and pass static accessibility audits in route tests under `src/app/(app)`

### Implementation for User Story 2

- [X] T017 [US2] Ensure state actions use existing buttons/links without duplicate labels across updated route components
- [X] T018 [US2] Ensure focus-visible styles cover button, link, input, select, textarea, and summary selectors in `src/app/globals.css`

**Checkpoint**: User Story 2 is independently testable by render assertions and manual keyboard checks.

---

## Phase 5: User Story 3 - Confirm Theming and Responsive Consistency (Priority: P2)

**Goal**: Shared state blocks fit existing responsive layouts and use theme tokens in both supported token contexts.

**Independent Test**: Inspect rendered classes and quickstart route inventory for mobile/tablet/desktop plus dark/light token checks.

### Tests for User Story 3

- [X] T019 [P] [US3] Assert `AppState` uses token-backed classes and stable spacing in `src/shared/ui/app-state.test.tsx`

### Implementation for User Story 3

- [X] T020 [US3] Keep updated route state wrappers responsive using existing flex/grid containers in `src/app/(app)` files
- [X] T021 [US3] Add route inventory and breakpoint/theme checklist to `specs/001-cross-page-polish/quickstart.md`

**Checkpoint**: User Story 3 has reusable state styling and manual responsive/theming verification instructions.

---

## Phase 6: User Story 4 - Complete the Go-Live Smoke Path (Priority: P2)

**Goal**: Release owner has a concise repeatable smoke path covering the assembled product experience.

**Independent Test**: Follow `quickstart.md` and verify all steps are covered by either automated checks or manual audit rows.

### Implementation for User Story 4

- [X] T022 [US4] Add manual accessibility and smoke-path evidence checklist to `specs/001-cross-page-polish/quickstart.md`
- [X] T023 [US4] Add state-pattern exception rules to `docs/context/design-system.md`

**Checkpoint**: User Story 4 is ready for release-owner manual validation.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Validate and clean up the full change set.

- [X] T024 Run `pnpm lint`
- [X] T025 Run `pnpm typecheck`
- [X] T026 Run `pnpm test`
- [X] T027 Mark all completed tasks in `specs/001-cross-page-polish/tasks.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- Setup (Phase 1): No dependencies.
- Foundational (Phase 2): Depends on Setup completion and blocks page adoption.
- User Story 1 (Phase 3): Depends on Foundation and is the MVP.
- User Story 2 (Phase 4): Depends on shared state and can be validated alongside US1 route tests.
- User Story 3 (Phase 5): Depends on shared state styling and route adoption.
- User Story 4 (Phase 6): Depends on documented patterns and route inventory.
- Polish (Phase 7): Depends on all selected story work.

### Parallel Opportunities

- T002 and T003 can run in parallel.
- T008 and T009 can run in parallel after T005.
- T015, T016, and T019 can run while route adoption is being prepared, provided file conflicts are avoided.

## Implementation Strategy

1. Complete setup and shared-state foundation.
2. Implement MVP state adoption across representative route surfaces.
3. Add accessibility/focus coverage and responsive/manual smoke documentation.
4. Run lint, typecheck, and tests; fix failures before committing.
