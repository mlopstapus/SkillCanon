# Tasks: Distribution Tenant Isolation Tests

**Input**: Design documents from `/specs/030-distribution-tenant-isolation/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/distribution-tenant-isolation.md, quickstart.md

**Tests**: Required by the feature specification and constitution. Write/verify failing tenant-isolation tests before/alongside enabling RLS on `distribution.prompt_usage`.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify existing tenant-isolation primitives, migration sequence, and current query surface before feature work.

- [X] T001 Inspect existing `distribution.prompt_usage` migrations `drizzle/migrations/0022_distribution_prompt_usage.sql` and `0025_distribution_usage_telemetry.sql` and confirm next migration number (`0026`)
- [X] T001a Confirm the `distribution` schema still contains only `prompt_usage` by inspecting `src/bcs/distribution/infrastructure/schema.ts` and `drizzle/migrations/meta/_journal.json` for any new `distribution_*` migration landed since `0025` — per spec.md's Edge Cases, FR-001/the query audit must extend to any such table, not just `prompt_usage`
- [X] T002 Inspect the current query surface in `src/bcs/distribution/infrastructure/prompt-usage-repo.ts` (`insert`, `countTotalForProject`, `listSinceForProject`, `listGroupedBySkillForProject`, `listGroupedByMemberForProject`, `listDailyCountsBySkillForProject`, `listForOrganizationWindow`) and confirm every function already filters by `organizationId`
- [X] T003 Inspect shared tenant-isolation helper in `src/shared/testing/tenant-isolation.ts` and Prompt Registry's `prompt_versions` precedent (no app-layer write path) in `src/bcs/prompt-registry/application/tenant-isolation.test.ts`

**Checkpoint**: Prerequisites confirmed — proceed to foundational work.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Set up the query-audit artifact every story's work feeds into.

- [X] T004 Create Distribution query audit document skeleton in `src/bcs/distribution/application/query-audit.md`

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 - Distribution RLS blocks cross-organization access to usage data (Priority: P1) MVP

**Goal**: Database RLS independently blocks cross-organization reads and writes for `distribution.prompt_usage`.

**Independent Test**: `pnpm test src/bcs/distribution/application/tenant-isolation.test.ts` proves raw unfiltered read/write attempts under organization A cannot access organization B's usage rows, and a real `recordPromptUsage()` call cannot insert a row claiming a different organization than the session's tenant context.

### Tests for User Story 1

- [X] T005 [US1] Add failing RLS-alone read denial test (raw SQL select by id) for `distribution.prompt_usage` in `src/bcs/distribution/application/tenant-isolation.test.ts`
- [X] T006 [US1] Add failing RLS-alone write denial tests (raw SQL update-by-id and delete-by-id) for `distribution.prompt_usage` in `src/bcs/distribution/application/tenant-isolation.test.ts`
- [X] T007 [US1] Add failing RLS `WITH CHECK` denial test: a real `recordPromptUsage()` call under organization A's tenant context whose `organizationId` argument is organization B must throw, in `src/bcs/distribution/application/tenant-isolation.test.ts`

### Implementation for User Story 1

- [X] T008 [US1] Add `drizzle/migrations/0026_distribution_rls.sql` enabling and forcing RLS on `distribution.prompt_usage`
- [X] T009 [US1] Add tenant-isolation policy in `drizzle/migrations/0026_distribution_rls.sql`: direct `organization_id` predicate (`USING`/`WITH CHECK`), matching `0019_prompt_registry_rls.sql`'s pattern for tables with a direct column

**Checkpoint**: User Story 1 is complete when RLS-alone denial tests and the `recordPromptUsage` cross-org insert-denial test pass.

---

## Phase 4: User Story 2 - Distribution services keep organization filters as the primary control (Priority: P1)

**Goal**: Existing `recordPromptUsage`/`getPromptUsageSummaryForProject`/`getPromptUsageSummaryForOrganization` queries are audited and any missing `organization_id` filter is fixed.

**Independent Test**: Audit all files listed in `query-audit.md`; existing app-layer cross-org-exclusion tests continue to pass.

### Tests for User Story 2

- [X] T010 [US2] Confirm `get-prompt-usage-summary-for-project.test.ts`'s existing "never returns another organization's usage rows, even given the same projectId" test still passes after RLS is enabled (no new test needed — this is the app-layer proof for User Story 2)
- [X] T011 [US2] Confirm `get-prompt-usage-summary-for-organization.test.ts`'s existing "aggregates ... within the requested organization" test still passes after RLS is enabled (no new test needed — this is the app-layer proof for User Story 2)

### Implementation for User Story 2

- [X] T012 [US2] Audit `recordPromptUsage` (`src/bcs/distribution/application/record-prompt-usage.ts` → `infrastructure/prompt-usage-repo.ts`'s `insert`) and record results in `src/bcs/distribution/application/query-audit.md`
- [X] T013 [US2] Audit `getPromptUsageSummaryForProject` and its internal repo reads (`countTotalForProject`, `listSinceForProject`, `listGroupedBySkillForProject`, `listGroupedByMemberForProject`, `listDailyCountsBySkillForProject`) and record results in `src/bcs/distribution/application/query-audit.md`
- [X] T014 [US2] Audit `getPromptUsageSummaryForOrganization` and its internal repo read (`listForOrganizationWindow`) and record results in `src/bcs/distribution/application/query-audit.md`
- [X] T015 [US2] Fix any missing `organization_id` filter found in `src/bcs/distribution/application/*.ts` or `src/bcs/distribution/infrastructure/*.ts`

**Checkpoint**: User Story 2 is complete when query audit records zero gaps and existing app-layer denial tests pass.

---

## Phase 5: User Story 3 - Shared cross-tenant-denial helper covers Distribution's usage resource (Priority: P2)

**Goal**: Distribution's tenant-isolation test uses the shared helper rather than a Distribution-only duplicate.

**Independent Test**: Inspect `src/bcs/distribution/application/tenant-isolation.test.ts` and confirm every denial path calls `assertCrossTenantDenied()`.

### Tests for User Story 3

- [X] T016 [US3] Verify shared-helper use for all denial checks in `src/bcs/distribution/application/tenant-isolation.test.ts`

### Implementation for User Story 3

- [X] T017 [US3] Extend `src/shared/testing/tenant-isolation.ts` only if the `recordPromptUsage` cross-org insert-denial case cannot fit the current callback contract (expected: no change needed — the callback already accepts an arbitrary async function)

**Checkpoint**: User Story 3 is complete when Distribution has no parallel tenant-isolation helper and the shared helper remains reusable.

---

## Final Phase: Polish & Cross-Cutting Concerns

**Purpose**: Validate the feature end to end and keep documentation consistent.

- [X] T018 Run focused Distribution tenant-isolation tests with `pnpm test src/bcs/distribution/application/tenant-isolation.test.ts`
- [X] T019 Run the rest of the Distribution bounded context's existing tests with `pnpm test src/bcs/distribution` to confirm no regression from the new RLS migration
- [X] T020 Run full project validation with `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`
- [X] T021 Update `specs/030-distribution-tenant-isolation/quickstart.md` if validation commands or behavior differ from the implemented result

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion — blocks all user stories.
- **User Stories (Phase 3+)**: Depend on Foundational completion. US1 and US2 are both P1; implement US1 before US2 because the RLS backstop should exist before confirming the app-layer proofs it backstops.
- **Polish (Final Phase)**: Depends on all desired user stories being complete.

### User Story Dependencies

- **User Story 1 (P1)**: Depends on T004.
- **User Story 2 (P1)**: Depends on T004; should run after US1 implementation to validate both primary and backstop controls together.
- **User Story 3 (P2)**: Depends on T005-T007 because it verifies helper usage in the completed denial tests.

### Parallel Opportunities

- T005, T006, T007 affect the same test file, so execute sequentially despite similar shape.
- T012, T013, T014 are independent audit sections in the same document; execute sequentially to avoid merge churn.
- T010 and T011 touch different existing test files and can be verified in parallel.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001-T004.
2. Add failing raw RLS tests and the `recordPromptUsage` cross-org insert-denial test T005-T007.
3. Add migration T008-T009.
4. Validate focused tests T018.

### Incremental Delivery

1. Deliver US1 RLS backstop.
2. Deliver US2 application-layer audit (confirming existing cross-org-exclusion tests still pass).
3. Deliver US3 helper-use verification.
4. Run full validation and open PR.

## Notes

- Completed tasks must be marked `[X]` as implementation progresses.
- Do not add a Distribution-specific helper unless the shared helper contract cannot express the required denial case.
- `distribution.prompt_usage` has no app-layer read-by-id, update, or delete path (immutable, append-only, aggregate-only reads by design) — do not add one to satisfy this feature; its read/write-denial proof is RLS-alone (raw SQL) plus the `recordPromptUsage` cross-org insert-denial case, not an app-layer by-id accessor.
