# Tasks: Policy Model & CRUD

**Input**: Design documents from `/specs/017-policy-model-crud/`
**Prerequisites**: plan.md, research.md, data-model.md, contracts/governance-policies.md, quickstart.md

## Phase 1: Setup

- [X] T001 Add `governance.policies` schema definition in `src/bcs/governance/infrastructure/schema.ts`
- [X] T002 Add migration `drizzle/migrations/0009_governance_policies.sql` for `governance.policies` table, indexes, app-role grants, and exactly-one-scope check constraint
- [X] T003 Add policy domain types and errors in `src/bcs/governance/domain/policy.ts`
- [X] T004 Add policy repository CRUD helpers in `src/bcs/governance/infrastructure/policies-repo.ts`
- [X] T005 Export policy public API surface from `src/bcs/governance/index.ts`

## Phase 2: Foundational

- [X] T006 Add shared Governance policy test fixture helpers in `src/bcs/governance/application/policy-test-helpers.ts`

## Phase 3: User Story 1 - Create a policy at a single, unambiguous scope (P1)

**Independent Test**: Creating a valid team/project-scoped policy persists an active policy and audit row; both-scope, neither-scope, and wrong-org scope creates throw and persist no policy/audit row.

- [X] T007 [P] [US1] Write failing create policy integration tests in `src/bcs/governance/application/create-policy.test.ts`
- [X] T008 [US1] Implement `createPolicy` in `src/bcs/governance/application/create-policy.ts` with exactly-one-scope validation, same-org verifier calls, client-generated id, insert, and `withAudit()` `policy.created` event

## Phase 4: User Story 2 - Read, update, and deactivate an existing policy (P2)

**Independent Test**: Get/update/delete operate only within the actor organization; update changes editable fields only; delete soft-deactivates and audits; cross-org ids are not accessible.

- [X] T009 [P] [US2] Write failing get policy integration tests in `src/bcs/governance/application/get-policy.test.ts`
- [X] T010 [P] [US2] Write failing update policy integration tests in `src/bcs/governance/application/update-policy.test.ts`
- [X] T011 [P] [US2] Write failing delete policy integration tests in `src/bcs/governance/application/delete-policy.test.ts`
- [X] T012 [US2] Implement `getPolicy` in `src/bcs/governance/application/get-policy.ts`
- [X] T013 [US2] Implement `updatePolicy` in `src/bcs/governance/application/update-policy.ts` with org-scoped lookup, editable-field updates only, and `withAudit()` `policy.updated` event
- [X] T014 [US2] Implement `deletePolicy` in `src/bcs/governance/application/delete-policy.ts` as soft deactivate with org-scoped lookup and one `policy.deactivated` audit event when state changes

## Phase 5: User Story 3 - List active policies at a team or project scope (P3)

**Independent Test**: Team/project list operations return only active policies scoped to the actor organization and requested scope, ordered by priority descending.

- [X] T015 [P] [US3] Write failing team policy list integration tests in `src/bcs/governance/application/list-team-policies.test.ts`
- [X] T016 [P] [US3] Write failing project policy list integration tests in `src/bcs/governance/application/list-project-policies.test.ts`
- [X] T017 [US3] Implement `listTeamPolicies` in `src/bcs/governance/application/list-team-policies.ts`
- [X] T018 [US3] Implement `listProjectPolicies` in `src/bcs/governance/application/list-project-policies.ts`

## Final Phase: Polish & Cross-Cutting

- [X] T019 Run focused policy tests with `pnpm vitest run src/bcs/governance/application/*.test.ts`
- [X] T020 Run full validation via `/as-finish` and address any failures
- [X] T021 Update issue metadata/status/PR context only after checks pass

## Dependencies

- Setup T001-T005 before Foundational T006.
- T006 before all user-story tests.
- US1 implementation T008 depends on T007.
- US2 implementation T012-T014 depends on T009-T011 and existing create functionality.
- US3 implementation T017-T018 depends on T015-T016 and create/delete functionality.
- Polish T019-T021 after all user stories.

## Parallel Execution Examples

- After T006, run T009/T010/T011 in parallel because they write different test files.
- After T014, run T015/T016 in parallel because team and project list tests are independent files.

## Implementation Strategy

Build the minimum complete vertical slice first: schema, domain/repo, fixture helpers, then create tests and implementation. Once creation is stable, layer get/update/delete, then list operations. Keep each story independently testable and mark each task `[X]` only after its implementation and focused checks pass.
