# Tasks: Hierarchical Resolution Engine

**Input**: Design documents from `/specs/003-hierarchical-resolution-engine/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/governance-resolution.md, quickstart.md

**Tests**: Required. The feature specification requires characterization tests that prove parity with the legacy Python resolver behavior before completion.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify existing structure and add shared type surfaces used by all resolver stories.

- [X] T001 Verify existing ignore/config coverage for Node.js, Vitest, Drizzle, and Testcontainers in `.gitignore`, `eslint.config.mjs`, and `package.json`
- [X] T002 [P] Add effective resolver result types to `src/bcs/governance/domain/policy.ts`
- [X] T003 [P] Add effective resolver result types to `src/bcs/governance/domain/objective.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add repository reads and fixture helpers that every resolver story depends on.

**CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Add active team/project policy read helpers and count helpers in `src/bcs/governance/infrastructure/policies-repo.ts`
- [X] T005 Add active team/project/user objective read helpers and count helpers in `src/bcs/governance/infrastructure/objectives-repo.ts`
- [X] T006 [P] Extend policy fixture helpers for multi-team, project, inactive, and cross-organization records in `src/bcs/governance/application/policy-test-helpers.ts`
- [X] T007 [P] Extend objective fixture helpers for multi-team, project, user-personal, inactive, and cross-organization records in `src/bcs/governance/application/objective-test-helpers.ts`

---

## Phase 3: User Story 1 - Resolve effective policies for a user (Priority: P1) MVP

**Goal**: Return inherited ancestor-team policies and local own-team/project policies with legacy membership, ordering, and inherited flags.

**Independent Test**: Run `pnpm test -- src/bcs/governance/application/resolve-effective-policies.test.ts` and verify the characterization fixtures pass.

### Tests for User Story 1

- [X] T008 [P] [US1] Write policy characterization tests for ancestor, own-team, project, inactive, missing-user, freshness, and cross-organization fixtures in `src/bcs/governance/application/resolve-effective-policies.test.ts`

### Implementation for User Story 1

- [X] T009 [US1] Implement `resolveEffectivePolicies` in `src/bcs/governance/application/resolve-effective-policies.ts`
- [X] T010 [US1] Export `resolveEffectivePolicies` and effective policy types from `src/bcs/governance/index.ts`

**Checkpoint**: User Story 1 should be fully functional and testable independently.

---

## Phase 4: User Story 2 - Produce the final merged policy order (Priority: P1)

**Goal**: Return all effective policies sorted by priority descending with inherited policies winning equal-priority ties.

**Independent Test**: Run `pnpm test -- src/bcs/governance/application/resolve-effective-policies.test.ts` and verify merged-order characterization fixtures pass.

### Tests for User Story 2

- [X] T011 [P] [US2] Add merged policy priority and inherited-wins-ties tests in `src/bcs/governance/application/resolve-effective-policies.test.ts`

### Implementation for User Story 2

- [X] T012 [US2] Implement `resolveAllPolicies` in `src/bcs/governance/application/resolve-all-policies.ts`
- [X] T013 [US2] Export `resolveAllPolicies` from `src/bcs/governance/index.ts`

**Checkpoint**: User Stories 1 and 2 should both work independently.

---

## Phase 5: User Story 3 - Resolve effective objectives for a user (Priority: P1)

**Goal**: Return inherited ancestor-team objectives and local own-team/user/project objectives with legacy grouping, ordering, inherited flags, and flat title output.

**Independent Test**: Run `pnpm test -- src/bcs/governance/application/resolve-effective-objectives.test.ts` and verify the characterization fixtures pass.

### Tests for User Story 3

- [X] T014 [P] [US3] Write objective characterization tests for ancestor, own-team, user-personal, project, inactive, parent-link, missing-user, freshness, and cross-organization fixtures in `src/bcs/governance/application/resolve-effective-objectives.test.ts`

### Implementation for User Story 3

- [X] T015 [US3] Implement `resolveEffectiveObjectives` in `src/bcs/governance/application/resolve-effective-objectives.ts`
- [X] T016 [US3] Implement `resolveAllObjectives` in `src/bcs/governance/application/resolve-all-objectives.ts`
- [X] T017 [US3] Export objective resolution services and effective objective types from `src/bcs/governance/index.ts`

**Checkpoint**: User Story 3 should be fully functional and testable independently.

---

## Phase 6: User Story 4 - Count local Governance items for scope navigation (Priority: P2)

**Goal**: Return active local policy/objective counts for team and user nodes without inherited, project, inactive, or unrelated records.

**Independent Test**: Run `pnpm test -- src/bcs/governance/application/count-local-policies-and-objectives.test.ts` and verify team/user local-count fixtures pass.

### Tests for User Story 4

- [X] T018 [P] [US4] Write local-count tests for team nodes, user nodes, ancestor exclusion, project exclusion, inactive exclusion, and cross-organization rows in `src/bcs/governance/application/count-local-policies-and-objectives.test.ts`

### Implementation for User Story 4

- [X] T019 [US4] Implement `countLocalPoliciesAndObjectives` in `src/bcs/governance/application/count-local-policies-and-objectives.ts`
- [X] T020 [US4] Export `countLocalPoliciesAndObjectives` and count result types from `src/bcs/governance/index.ts`

**Checkpoint**: User Story 4 should be independently testable.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Validate the full contract and keep the Speckit artifacts in sync with implementation.

- [X] T021 Run focused Governance resolver tests from `specs/003-hierarchical-resolution-engine/quickstart.md`
- [X] T022 Run full project validation commands `pnpm test`, `pnpm typecheck`, and `pnpm lint`
- [X] T023 Update `specs/003-hierarchical-resolution-engine/tasks.md` so every completed task is checked off

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup completion and blocks all user stories.
- **User Stories (Phases 3-6)**: Depend on Foundational completion. P1 stories should be implemented before P2.
- **Polish (Phase 7)**: Depends on all selected user stories being complete.

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational.
- **US2 (P1)**: Depends on US1 because `resolveAllPolicies` consumes `resolveEffectivePolicies`.
- **US3 (P1)**: Can start after Foundational and does not depend on US1/US2.
- **US4 (P2)**: Can start after Foundational and does not depend on resolver implementation.

### Within Each User Story

- Tests MUST be written before implementation.
- Repository helpers and fixture helpers must exist before service tests.
- Services must be exported only after their implementations compile.

### Parallel Opportunities

- T002 and T003 can run in parallel.
- T006 and T007 can run in parallel after T004/T005 are understood.
- T008, T014, and T018 touch separate test files and can be drafted independently after foundational helpers.
- US3 and US4 can proceed independently once foundational helpers are complete.

---

## Parallel Example: User Story 3

```bash
Task: "Write objective characterization tests in src/bcs/governance/application/resolve-effective-objectives.test.ts"
Task: "Implement objective resolver in src/bcs/governance/application/resolve-effective-objectives.ts"
```

---

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2.
2. Complete US1 policy effective resolution.
3. Validate `resolve-effective-policies.test.ts`.
4. Add US2 merged policy ordering.

### Incremental Delivery

1. Deliver policy effective resolution.
2. Deliver merged policy ordering.
3. Deliver objective effective resolution and flat titles.
4. Deliver local-count service.
5. Run quickstart and full project checks.
