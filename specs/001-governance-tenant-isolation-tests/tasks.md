# Tasks: Governance Tenant Isolation Tests

**Input**: Design documents from `/specs/001-governance-tenant-isolation-tests/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/governance-tenant-isolation.md, quickstart.md

**Tests**: Required by the feature specification and constitution. Write/verify failing tenant-isolation tests before enabling Governance RLS.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify existing tenant-isolation primitives and migration sequence before feature work.

- [X] T001 Inspect existing Identity Access RLS migration in `drizzle/migrations/0007_identity_access_rls.sql`
- [X] T002 Inspect existing Governance table migrations in `drizzle/migrations/0009_governance_policies.sql` and `drizzle/migrations/0010_governance_objectives.sql`
- [X] T003 Inspect shared tenant-isolation helper in `src/shared/testing/tenant-isolation.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add the failing coverage and RLS policy skeleton that all stories use.

- [X] T004 [P] Create Governance tenant-isolation test fixture helpers in `src/bcs/governance/application/tenant-isolation.test.ts`
- [X] T005 [P] Create Governance query audit document in `src/bcs/governance/application/query-audit.md`

**Checkpoint**: Foundation ready - user story implementation can now begin.

---

## Phase 3: User Story 1 - Governance RLS blocks cross-organization access (Priority: P1) MVP

**Goal**: Database RLS independently blocks cross-organization reads and writes for policies and objectives.

**Independent Test**: `pnpm test src/bcs/governance/application/tenant-isolation.test.ts` proves raw unfiltered read/write attempts under organization A cannot access organization B rows.

### Tests for User Story 1

- [X] T006 [US1] Add failing RLS-alone read/write denial tests for `governance.policies` in `src/bcs/governance/application/tenant-isolation.test.ts`
- [X] T007 [US1] Add failing RLS-alone read/write denial tests for `governance.objectives` in `src/bcs/governance/application/tenant-isolation.test.ts`

### Implementation for User Story 1

- [X] T008 [US1] Add `drizzle/migrations/0011_governance_rls.sql` enabling and forcing RLS on `governance.policies` and `governance.objectives`
- [X] T009 [US1] Add select/insert/update/delete policies in `drizzle/migrations/0011_governance_rls.sql` using the session organization context

**Checkpoint**: User Story 1 is complete when RLS-alone policy/objective read and write denial tests pass.

---

## Phase 4: User Story 2 - Governance services keep organization filters as the primary control (Priority: P1)

**Goal**: Existing policy/objective service queries are audited and any missing `organization_id` filter is fixed.

**Independent Test**: Audit all files listed in `query-audit.md`; existing and focused service tests confirm cross-org get/update/delete/list behavior remains denied at the application layer.

### Tests for User Story 2

- [X] T010 [US2] Add app-layer cross-org read/write denial checks for policy services in `src/bcs/governance/application/tenant-isolation.test.ts`
- [X] T011 [US2] Add app-layer cross-org read/write denial checks for objective services in `src/bcs/governance/application/tenant-isolation.test.ts`

### Implementation for User Story 2

- [X] T012 [US2] Audit policy service query filters and record results in `src/bcs/governance/application/query-audit.md`
- [X] T013 [US2] Audit objective service query filters and record results in `src/bcs/governance/application/query-audit.md`
- [X] T014 [US2] Fix any missing `organization_id` filter found in `src/bcs/governance/application/*.ts` or `src/bcs/governance/infrastructure/*.ts`

**Checkpoint**: User Story 2 is complete when query audit records zero gaps and app-layer denial tests pass.

---

## Phase 5: User Story 3 - Shared cross-tenant-denial helper covers Governance resources (Priority: P2)

**Goal**: Governance tenant-isolation tests use the shared helper rather than a Governance-only duplicate.

**Independent Test**: Inspect `src/bcs/governance/application/tenant-isolation.test.ts` and confirm every policy/objective denial path calls `assertCrossTenantDenied()`.

### Tests for User Story 3

- [X] T015 [US3] Verify shared-helper use for policy and objective denial tests in `src/bcs/governance/application/tenant-isolation.test.ts`

### Implementation for User Story 3

- [X] T016 [US3] Extend `src/shared/testing/tenant-isolation.ts` only if Governance write adapters cannot fit the current callback contract

**Checkpoint**: User Story 3 is complete when Governance has no parallel tenant-isolation helper and the shared helper remains reusable.

---

## Final Phase: Polish & Cross-Cutting Concerns

**Purpose**: Validate the feature end to end and keep documentation consistent.

- [X] T017 Run focused Governance tenant-isolation tests with `pnpm test src/bcs/governance/application/tenant-isolation.test.ts`
- [X] T018 Run full project validation with `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`
- [X] T019 Update `specs/001-governance-tenant-isolation-tests/quickstart.md` if validation commands or behavior differ from the implemented result

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion - blocks all user stories.
- **User Stories (Phase 3+)**: Depend on Foundational completion. US1 and US2 are both P1; implement US1 before US2 because app-layer checks are easier to interpret once the RLS backstop exists.
- **Polish (Final Phase)**: Depends on all desired user stories being complete.

### User Story Dependencies

- **User Story 1 (P1)**: Depends on T004.
- **User Story 2 (P1)**: Depends on T004 and T005; should run after US1 implementation to validate both primary and backstop controls.
- **User Story 3 (P2)**: Depends on T006-T011 because it verifies helper usage in the completed denial tests.

### Parallel Opportunities

- T004 and T005 affect different files and can run in parallel.
- T006 and T007 affect the same test file, so execute sequentially despite similar shape.
- T012 and T013 are independent audit sections in the same document; execute sequentially to avoid merge churn.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001-T004.
2. Add failing raw RLS tests T006-T007.
3. Add migration T008-T009.
4. Validate focused tests T017.

### Incremental Delivery

1. Deliver US1 RLS backstop.
2. Deliver US2 application-layer audit and denial checks.
3. Deliver US3 helper-use verification.
4. Run full validation and open PR.

## Notes

- Completed tasks must be marked `[X]` as implementation progresses.
- Do not add a Governance-specific helper unless the shared helper contract cannot express a required denial case.
