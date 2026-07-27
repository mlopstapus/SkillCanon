# Tasks: Project Model & Membership

**Input**: Design documents from `specs/001-project-model-membership/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/prompt-registry-projects.md`, `quickstart.md`

## Phase 1: Setup

- [X] T001 Verify current Prompt Registry ownership and public contract placeholders in `src/bcs/prompt-registry/CONTRACT.md`, `src/bcs/prompt-registry/index.ts`, and `src/bcs/prompt-registry/OWNERSHIP.md`
- [X] T002 Verify existing ignore files cover Node/Drizzle/Testcontainers outputs in `.gitignore`, `.dockerignore`, and `.prettierignore`

## Phase 2: Foundational

- [X] T003 Add Drizzle schema for `projects` and `projectMembers` in `src/bcs/prompt-registry/infrastructure/schema.ts`
- [X] T004 Add SQL migration for `prompt_registry.projects`, `prompt_registry.project_members`, indexes, uniqueness, cascade delete, and RLS in `drizzle/migrations/0012_prompt_registry_projects.sql`
- [X] T005 Add Prompt Registry project domain types, verifier interfaces, and domain errors in `src/bcs/prompt-registry/domain/project.ts`
- [X] T006 Add project repository primitives in `src/bcs/prompt-registry/infrastructure/projects-repo.ts`
- [X] T007 Add project member repository primitives in `src/bcs/prompt-registry/infrastructure/project-members-repo.ts`
- [X] T008 [P] Add reusable Prompt Registry test fixtures and audit query helpers in `src/bcs/prompt-registry/application/project-test-helpers.ts`
- [X] T009 Update Prompt Registry public exports and project read-contract documentation in `src/bcs/prompt-registry/index.ts` and `src/bcs/prompt-registry/CONTRACT.md`

## Phase 3: User Story 1 - Create an organization-scoped project (P1)

**Goal**: Create a project only for a valid organization/team and optional same-organization lead user, then audit it transactionally.

**Independent Test**: Create a project for a valid organization/team/lead combination and verify the row, read contract fields, and exactly one `project.created` audit event; invalid team/lead inputs create no project and no audit event.

- [X] T010 [P] [US1] Add failing create-project acceptance tests in `src/bcs/prompt-registry/application/create-project.test.ts`
- [X] T011 [P] [US1] Add repository uniqueness tests for project name and slug in `src/bcs/prompt-registry/infrastructure/projects-repo.test.ts`
- [X] T012 [US1] Implement `createProject` in `src/bcs/prompt-registry/application/create-project.ts`
- [X] T013 [US1] Translate duplicate project name/slug database failures into domain errors in `src/bcs/prompt-registry/application/create-project.ts`

## Phase 4: User Story 2 - Manage project membership across teams in one organization (P2)

**Goal**: Add, list, and remove project members while allowing cross-team same-org users and rejecting cross-org or duplicate membership.

**Independent Test**: Add users from the owning team and another same-org team, list them in creation order, remove one, and verify membership state and audit events; cross-org and duplicate attempts write nothing.

- [X] T014 [P] [US2] Add failing add/list/remove member acceptance tests in `src/bcs/prompt-registry/application/add-project-member.test.ts`, `src/bcs/prompt-registry/application/list-project-members.test.ts`, and `src/bcs/prompt-registry/application/remove-project-member.test.ts`
- [X] T015 [P] [US2] Add repository uniqueness and ordering tests in `src/bcs/prompt-registry/infrastructure/project-members-repo.test.ts`
- [X] T016 [US2] Implement `addProjectMember` in `src/bcs/prompt-registry/application/add-project-member.ts`
- [X] T017 [US2] Implement `listProjectMembers` in `src/bcs/prompt-registry/application/list-project-members.ts`
- [X] T018 [US2] Implement `removeProjectMember` in `src/bcs/prompt-registry/application/remove-project-member.ts`

## Phase 5: User Story 3 - Read and update projects within organization boundaries (P3)

**Goal**: Read, update, and list projects only inside the caller's organization boundary.

**Independent Test**: Create projects across two organizations and teams, then verify get/update/list-by-organization/list-by-team return only authorized organization/team data and update writes exactly one audit event.

- [X] T019 [P] [US3] Add failing get/list/update acceptance tests in `src/bcs/prompt-registry/application/get-project.test.ts`, `src/bcs/prompt-registry/application/list-projects.test.ts`, and `src/bcs/prompt-registry/application/update-project.test.ts`
- [X] T020 [US3] Implement `getProject` in `src/bcs/prompt-registry/application/get-project.ts`
- [X] T021 [US3] Implement `listProjectsByOrganization` and `listProjectsByTeam` in `src/bcs/prompt-registry/application/list-projects.ts`
- [X] T022 [US3] Implement `updateProject` in `src/bcs/prompt-registry/application/update-project.ts`

## Phase 6: User Story 4 - Delete a project when it is no longer needed (P4)

**Goal**: Delete an organization-scoped project, hide it from reads/lists, cascade membership grants, and audit the deletion.

**Independent Test**: Create a project with members, delete it, verify project/member reads return nothing and exactly one `project.deleted` audit event exists; cross-org delete writes nothing.

- [X] T023 [P] [US4] Add failing delete-project acceptance tests in `src/bcs/prompt-registry/application/delete-project.test.ts`
- [X] T024 [US4] Implement `deleteProject` in `src/bcs/prompt-registry/application/delete-project.ts`

## Phase 7: Polish & Cross-Cutting

- [X] T025 [P] Add legacy project-service characterization coverage using `legacy/backend/src/spechub_server/services/project_service.py` and `legacy/backend/tests/test_projects.py` as references in `src/bcs/prompt-registry/application/project-characterization.test.ts`
- [X] T026 Run targeted Prompt Registry tests with `pnpm test -- src/bcs/prompt-registry` and fix failures
- [X] T027 Run `pnpm lint`, `pnpm typecheck`, and `pnpm build`, then fix reported issues
- [X] T028 Update `specs/001-project-model-membership/quickstart.md` if validation commands or behavior differ from implementation

## Dependencies

- Phase 1 before Phase 2.
- Phase 2 before all user stories.
- User Story 1 is MVP and should complete before User Stories 2-4 because membership, read/update, and delete require projects to exist.
- User Story 2 can run after User Story 1.
- User Story 3 can run after User Story 1.
- User Story 4 can run after User Story 1 and should run after membership cascade behavior exists.
- Polish runs after all stories.

## Parallel Examples

- T008 can run with T006/T007 once schema exists because it creates test helpers.
- T010 and T011 can run in parallel because they target application and repository tests.
- T014 and T015 can run in parallel because they target application and repository tests.
- T019 test files can be drafted in parallel by operation.

## Implementation Strategy

1. Build the schema, migration, domain types, and repositories first.
2. Deliver MVP with User Story 1 and prove create-project invariants plus audit behavior.
3. Add membership management as the next independently testable layer.
4. Add read/update/list operations and then delete/cascade behavior.
5. Run the targeted tests and full finish pipeline before commit/PR.
