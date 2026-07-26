# Tasks: Objective Model & CRUD

**Input**: Design documents from `/specs/001-objective-model-crud/`
**Prerequisites**: plan.md, research.md, data-model.md, contracts/governance-objectives.md, quickstart.md

## Phase 1: Setup

- [X] T001 Add `governance.objectives` schema definition in `src/bcs/governance/infrastructure/schema.ts`
- [X] T002 Add migration `drizzle/migrations/0010_governance_objectives.sql` for `governance.objectives` table, indexes, app-role grants, self-FK, and self-parent check constraint
- [X] T003 Add objective domain types and errors in `src/bcs/governance/domain/objective.ts`
- [X] T004 Add objective repository CRUD/list/tree helpers in `src/bcs/governance/infrastructure/objectives-repo.ts`
- [X] T005 Export objective public API surface from `src/bcs/governance/index.ts` and update `src/bcs/governance/CONTRACT.md` with `ObjectiveDeleted`

## Phase 2: Foundational

- [X] T006 Add shared Governance objective test fixture helpers in `src/bcs/governance/application/objective-test-helpers.ts`

## Phase 3: User Story 1 - Manage scoped objectives (P1) MVP

**Independent Test**: Create organization-only, team, project, user, and multi-scope objectives; retrieve each by id; update mutable fields; hard-delete an objective; and verify default active/not-inherited values plus Python-compatible behavior.

- [X] T007 [P] [US1] Write failing create objective integration tests in `src/bcs/governance/application/create-objective.test.ts`
- [X] T008 [P] [US1] Write failing get objective integration tests in `src/bcs/governance/application/get-objective.test.ts`
- [X] T009 [P] [US1] Write failing update objective integration tests in `src/bcs/governance/application/update-objective.test.ts`
- [X] T010 [P] [US1] Write failing delete objective integration tests in `src/bcs/governance/application/delete-objective.test.ts`
- [X] T011 [US1] Implement `createObjective` in `src/bcs/governance/application/create-objective.ts` with permissive scope persistence, default status/isInherited values, client-generated id, insert, and `withAudit()` `objective.created` event
- [X] T012 [US1] Implement `getObjective` in `src/bcs/governance/application/get-objective.ts`
- [X] T013 [US1] Implement `updateObjective` in `src/bcs/governance/application/update-objective.ts` with org-scoped lookup, editable-field updates, and `withAudit()` `objective.updated` event
- [X] T014 [US1] Implement `deleteObjective` in `src/bcs/governance/application/delete-objective.ts` as hard delete with org-scoped lookup and one `objective.deleted` audit event

## Phase 4: User Story 2 - Preserve organization boundaries (P1)

**Independent Test**: Seed two organizations and verify cross-organization team/project/user/parent create and update attempts throw with no objective row change and no audit row.

- [X] T015 [P] [US2] Add cross-organization scope and parent create assertions in `src/bcs/governance/application/create-objective.test.ts`
- [X] T016 [P] [US2] Add cross-organization scope and parent update assertions in `src/bcs/governance/application/update-objective.test.ts`
- [X] T017 [US2] Implement same-organization team/project/user scope validation shared by `createObjective` and `updateObjective` in `src/bcs/governance/domain/objective.ts` and `src/bcs/governance/application/*objective.ts`
- [X] T018 [US2] Implement same-organization parent objective validation in `src/bcs/governance/application/create-objective.ts`, `src/bcs/governance/application/update-objective.ts`, and `src/bcs/governance/infrastructure/objectives-repo.ts`

## Phase 5: User Story 3 - Maintain objective trees safely (P2)

**Independent Test**: Build a parent-child-grandchild tree, perform valid parent moves, and verify self-parent and descendant-as-parent updates are rejected without changing persisted parent links.

- [X] T019 [P] [US3] Add objective tree cycle integration tests in `src/bcs/governance/application/create-objective.test.ts` and `src/bcs/governance/application/update-objective.test.ts`
- [X] T020 [US3] Implement acyclic parent traversal and `ObjectiveCycleError` checks in `src/bcs/governance/application/create-objective.ts`, `src/bcs/governance/application/update-objective.ts`, and `src/bcs/governance/infrastructure/objectives-repo.ts`

## Phase 6: User Story 4 - Produce auditable objective mutations (P2)

**Independent Test**: Perform accepted create/update/delete operations and verify exactly one audit event each; perform rejected mutations and verify zero audit events.

- [X] T021 [P] [US4] Add audit assertions for successful and rejected creates in `src/bcs/governance/application/create-objective.test.ts`
- [X] T022 [P] [US4] Add audit assertions for successful and rejected updates in `src/bcs/governance/application/update-objective.test.ts`
- [X] T023 [P] [US4] Add audit assertions for successful and rejected deletes in `src/bcs/governance/application/delete-objective.test.ts`
- [X] T024 [US4] Verify all objective mutations route through `withAudit()` and use `objective.created`, `objective.updated`, and `objective.deleted` audit actions in `src/bcs/governance/application/*objective.ts`

## Phase 7: Scoped Active Lists

**Independent Test**: Team/project/user list operations return only active objectives for the actor organization and requested scope, ordered by creation time ascending.

- [X] T025 [P] [US1] Write failing team objective list integration tests in `src/bcs/governance/application/list-team-objectives.test.ts`
- [X] T026 [P] [US1] Write failing project objective list integration tests in `src/bcs/governance/application/list-project-objectives.test.ts`
- [X] T027 [P] [US1] Write failing user objective list integration tests in `src/bcs/governance/application/list-user-objectives.test.ts`
- [X] T028 [US1] Implement `listTeamObjectives` in `src/bcs/governance/application/list-team-objectives.ts`
- [X] T029 [US1] Implement `listProjectObjectives` in `src/bcs/governance/application/list-project-objectives.ts`
- [X] T030 [US1] Implement `listUserObjectives` in `src/bcs/governance/application/list-user-objectives.ts`

## Final Phase: Polish & Cross-Cutting

- [X] T031 Run focused objective tests with `pnpm vitest run src/bcs/governance/application/*objective*.test.ts`
- [X] T032 Run full validation via `/as-finish` and address any failures
- [X] T033 Update issue metadata/status/PR context only after checks pass

## Dependencies

- Setup T001-T005 before Foundational T006.
- T006 before all user-story tests.
- US1 implementation T011-T014 depends on T007-T010.
- US2 implementation T017-T018 depends on T015-T016 and base create/update behavior.
- US3 implementation T020 depends on T019 and parent validation from T018.
- US4 verification T024 depends on T021-T023 and mutation implementations.
- Scoped active lists T028-T030 depend on T025-T027 and create/update functionality.
- Polish T031-T033 after all user stories and scoped list operations.

## Parallel Execution Examples

- After T006, run T007/T008/T009/T010 in parallel because they write different test files.
- T015 and T016 can be added in parallel because they target create and update tests separately.
- T021/T022/T023 can be added in parallel because audit assertions target different mutation test files.
- T025/T026/T027 can be written in parallel because team/project/user list tests are independent files.

## Implementation Strategy

Build the minimum complete vertical slice first: schema, migration, domain/repo, fixture helpers, then create/get/update/delete tests and implementation. Once base CRUD is stable, layer same-organization validation, tree cycle prevention, audit assertions, and scoped active list operations. Keep each story independently testable and mark each task `[X]` only after its implementation and focused checks pass.
