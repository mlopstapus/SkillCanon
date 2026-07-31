# Tasks: Prompt Registry Tenant Isolation Tests

**Input**: Design documents from `/specs/022-prompt-registry-tenant-isolation/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/prompt-registry-tenant-isolation.md, quickstart.md

**Tests**: Required by the feature specification and constitution. Write/verify failing tenant-isolation tests before/alongside enabling the remaining Prompt Registry RLS policies.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify existing tenant-isolation primitives and migration sequence before feature work.

- [X] T001 Inspect existing Prompt Registry RLS migration in `drizzle/migrations/0012_prompt_registry_projects.sql` and confirm next migration number (`0019`)
- [X] T002 Inspect Prompt Registry table migrations `0013_prompt_registry_prompts.sql`, `0017_prompt_registry_subscriptions.sql`, `0018_prompt_registry_project_teams_and_skill_assignments.sql` for column shapes (which tables have a direct `organization_id`, which need an `EXISTS` join)
- [X] T003 Inspect shared tenant-isolation helper in `src/shared/testing/tenant-isolation.ts` and Governance's usage in `src/bcs/governance/application/tenant-isolation.test.ts`

**Checkpoint**: Prerequisites confirmed — proceed to foundational work.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add the small app-layer/fixture gaps every story's tests depend on.

- [X] T004 [P] Create `get-subscription.ts` in `src/bcs/prompt-registry/application/` — thin `organizationId`-scoped read wrapper around `findByOrgAndId`, mirroring `get-project.ts`
- [X] T005 [P] Confirm `project_skill_assignments` cross-org fixtures can compose from existing `makeProjectTeamFixtureOrg` (has `otherOrgId`/`projectId`) + `createTestSkillOwnedByTeam` + `assignSkillToProject` inline in the test file — no new fixture-helper file needed (avoids an unnecessary abstraction for a 4-line composition already used verbatim by `assign-skill-to-project.test.ts`)
- [X] T006 [P] Create Prompt Registry query audit document skeleton in `src/bcs/prompt-registry/application/query-audit.md`

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 - Prompt Registry RLS blocks cross-organization access (Priority: P1) MVP

**Goal**: Database RLS independently blocks cross-organization reads and writes for all six resource types.

**Independent Test**: `pnpm test src/bcs/prompt-registry/application/tenant-isolation.test.ts` proves raw unfiltered read/write attempts under organization A cannot access organization B rows, for every resource type.

### Tests for User Story 1

- [X] T007 [US1] Add failing RLS-alone read/write denial tests for `prompt_registry.prompts` in `src/bcs/prompt-registry/application/tenant-isolation.test.ts`
- [X] T008 [US1] Add failing RLS-alone read/write denial tests for `prompt_registry.prompt_versions` in `src/bcs/prompt-registry/application/tenant-isolation.test.ts`
- [X] T009 [US1] Add failing RLS-alone read/write denial tests for `prompt_registry.subscriptions` in `src/bcs/prompt-registry/application/tenant-isolation.test.ts`
- [X] T010 [US1] Add failing RLS-alone read/write denial tests for `prompt_registry.project_teams` in `src/bcs/prompt-registry/application/tenant-isolation.test.ts`
- [X] T011 [US1] Add failing RLS-alone read/write denial tests for `prompt_registry.project_skill_assignments` in `src/bcs/prompt-registry/application/tenant-isolation.test.ts`
- [X] T012 [US1] Add RLS-alone read/write denial tests for `prompt_registry.projects` (already-enabled RLS, not yet tested) in `src/bcs/prompt-registry/application/tenant-isolation.test.ts`

### Implementation for User Story 1

- [X] T013 [US1] Add `drizzle/migrations/0019_prompt_registry_rls.sql` enabling and forcing RLS on `prompts`, `prompt_versions`, `subscriptions`, `project_teams`, `project_skill_assignments`
- [X] T014 [US1] Add tenant-isolation policies in `drizzle/migrations/0019_prompt_registry_rls.sql`: direct `organization_id` predicate for `prompts`/`subscriptions`/`project_skill_assignments`; `EXISTS`-join predicate for `prompt_versions` (→ `prompts`) and `project_teams` (→ `projects`)

**Checkpoint**: User Story 1 is complete when RLS-alone denial tests pass for all six resource types.

---

## Phase 4: User Story 2 - Prompt Registry services keep organization filters as the primary control (Priority: P1)

**Goal**: Existing project/prompt/version/subscription/project-skill-assignment service queries (features 001, 002, 003, 007) are audited and any missing `organization_id` filter is fixed.

**Independent Test**: Audit all files listed in `query-audit.md`; app-layer denial tests confirm cross-org get/update/delete/list behavior remains denied at the application layer.

### Tests for User Story 2

- [X] T015 [US2] Add app-layer cross-org read/write denial checks for `projects` (`getProject`/`updateProject`) in `src/bcs/prompt-registry/application/tenant-isolation.test.ts`
- [X] T016 [US2] Add app-layer cross-org read/write denial checks for `project_teams` (`listProjectTeams`/`removeCollaboratorTeam`, keyed by `projectId`) in `src/bcs/prompt-registry/application/tenant-isolation.test.ts`
- [X] T017 [US2] Add app-layer cross-org read/write denial checks for `prompts` (`getPromptById`/`forkSkill`) in `src/bcs/prompt-registry/application/tenant-isolation.test.ts`
- [X] T018 [US2] Add app-layer cross-org read denial check for `prompt_versions` (`getPromptVersion`) in `src/bcs/prompt-registry/application/tenant-isolation.test.ts`
- [X] T019 [US2] Add app-layer cross-org read/write denial checks for `subscriptions` (`getSubscription`/`unsubscribeSkill`) in `src/bcs/prompt-registry/application/tenant-isolation.test.ts`
- [X] T020 [US2] Add app-layer cross-org read/write denial checks for `project_skill_assignments` (`listRequiredSkillsForProject`/`unassignSkillFromProject`, keyed by `projectId`) in `src/bcs/prompt-registry/application/tenant-isolation.test.ts`

### Implementation for User Story 2

- [X] T021 [US2] Audit feature 001 (project & project-team) service query filters and record results in `src/bcs/prompt-registry/application/query-audit.md`
- [X] T022 [US2] Audit feature 002 (prompt & version) service query filters and record results in `src/bcs/prompt-registry/application/query-audit.md`
- [X] T023 [US2] Audit feature 003 (subscribe & fork) service query filters and record results in `src/bcs/prompt-registry/application/query-audit.md`
- [X] T024 [US2] Audit feature 007 (project-skill assignment) service query filters and record results in `src/bcs/prompt-registry/application/query-audit.md`
- [X] T025 [US2] Fix any missing `organization_id` filter found in `src/bcs/prompt-registry/application/*.ts` or `src/bcs/prompt-registry/infrastructure/*.ts`

**Checkpoint**: User Story 2 is complete when query audit records zero gaps and app-layer denial tests pass.

---

## Phase 5: User Story 3 - Shared cross-tenant-denial helper covers all six Prompt Registry resource types (Priority: P2)

**Goal**: Prompt Registry tenant-isolation tests use the shared helper rather than a Prompt-Registry-only duplicate.

**Independent Test**: Inspect `src/bcs/prompt-registry/application/tenant-isolation.test.ts` and confirm every denial path calls `assertCrossTenantDenied()`.

### Tests for User Story 3

- [X] T026 [US3] Verify shared-helper use for all six resource types' denial tests in `src/bcs/prompt-registry/application/tenant-isolation.test.ts`

### Implementation for User Story 3

- [X] T027 [US3] Extend `src/shared/testing/tenant-isolation.ts` only if a Prompt Registry write adapter (e.g. `prompt_versions`' immutability, `subscriptions`' polymorphic subscriber shape) cannot fit the current callback contract

**Checkpoint**: User Story 3 is complete when Prompt Registry has no parallel tenant-isolation helper and the shared helper remains reusable.

---

## Final Phase: Polish & Cross-Cutting Concerns

**Purpose**: Validate the feature end to end and keep documentation consistent.

- [X] T028 Run focused Prompt Registry tenant-isolation tests with `pnpm test src/bcs/prompt-registry/application/tenant-isolation.test.ts`
- [X] T029 Run full project validation with `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`
- [X] T030 Update `specs/022-prompt-registry-tenant-isolation/quickstart.md` if validation commands or behavior differ from the implemented result

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion — blocks all user stories.
- **User Stories (Phase 3+)**: Depend on Foundational completion. US1 and US2 are both P1; implement US1 before US2 because app-layer checks are easier to interpret once the RLS backstop exists.
- **Polish (Final Phase)**: Depends on all desired user stories being complete.

### User Story Dependencies

- **User Story 1 (P1)**: Depends on T004-T006.
- **User Story 2 (P1)**: Depends on T004-T006; should run after US1 implementation to validate both primary and backstop controls.
- **User Story 3 (P2)**: Depends on T007-T020 because it verifies helper usage in the completed denial tests.

### Parallel Opportunities

- T004, T005, T006 affect different files and can run in parallel.
- T007-T012 affect the same test file, so execute sequentially despite similar shape.
- T021-T024 are independent audit sections in the same document; execute sequentially to avoid merge churn.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001-T006.
2. Add failing raw RLS tests T007-T012.
3. Add migration T013-T014.
4. Validate focused tests T028.

### Incremental Delivery

1. Deliver US1 RLS backstop.
2. Deliver US2 application-layer audit and denial checks.
3. Deliver US3 helper-use verification.
4. Run full validation and open PR.

## Notes

- Completed tasks must be marked `[X]` as implementation progresses.
- Do not add a Prompt-Registry-specific helper unless the shared helper contract cannot express a required denial case.
- `prompt_versions` has no app-layer write path (immutable by design) — do not add one to satisfy this feature; its write-denial proof is RLS-alone only.
