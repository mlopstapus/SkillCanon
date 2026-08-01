# Tasks: Workflow Model & CRUD

**Feature**: 023-workflow-model-crud
**Branch**: `023-workflow-model-crud`
**Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

---

## Phase 1: Setup

- [X] T001 Verify project environment (Node.js, pnpm, TypeScript, Vitest, Drizzle all configured — existing project; `workflow-orchestration` BC skeleton and `workflow` Postgres schema already exist)

---

## Phase 2: Foundational

- [X] T002 Extend `src/bcs/workflow-orchestration/infrastructure/schema.ts` (new file) with the `workflows` Drizzle table definition in the `workflow` schema (`id`, `organizationId`, `userId`, `projectId` nullable, `name`, `description` nullable, `steps` jsonb default `[]`, timestamps; indexes per data-model.md)
- [X] T003 Create `src/bcs/workflow-orchestration/domain/workflow.ts` with `Workflow`/`WorkflowStep`/`WorkflowSummary` types, `CreateWorkflowParams`/`UpdateWorkflowFields`/`ListWorkflowsFilter` types, error classes (`WorkflowNotFoundError`, `WorkflowProjectOrganizationMismatchError`, `InvalidWorkflowStepsError`, `NotAuthorizedError`), and `validateWorkflowSteps(input: unknown): WorkflowStep[]`
- [X] T004 Create `src/bcs/workflow-orchestration/infrastructure/workflows-repo.ts` with raw queries: `insert`, `findByOrgAndId`, `update`, `listByOrgAndFilters`

---

## Phase 3: User Story 1 — Create a workflow (P1)

**Goal**: An authenticated user can create a workflow (with or without a project scope, with or without steps) durably stored under their organization and ownership, with an audit event on success.

**Independent Test**: Create a workflow with a name and a small ordered step list; confirm it's retrievable afterward with the fields as submitted. Attempt to scope it to a project from a different organization; confirm rejection with no row and no audit event.

- [X] T005 [US1] Create `src/bcs/workflow-orchestration/application/create-workflow.ts` — `createWorkflow(db, actingUser, params, auditContext?)`: validates steps via `validateWorkflowSteps`, checks project org-boundary via `prompt-registry`'s `getProject` when `projectId` is provided (throws `WorkflowProjectOrganizationMismatchError` if not found in the caller's org), inserts via `withAudit` + `record` with action `workflow.created`
- [X] T006 [P] [US1] Create `src/bcs/workflow-orchestration/application/workflow-test-helpers.ts` (org/team/user fixture builder + real cross-BC project fixture via `prompt-registry`'s public `createProject`, plus raw-SQL row/audit-event query helpers) and `src/bcs/workflow-orchestration/application/create-workflow.test.ts` — tests: creates workflow with audit event recorded; creates with project scope in own org succeeds; project scope from a different org rejected (no row, no audit event); prompt name that doesn't exist anywhere still succeeds; empty step list succeeds; malformed step (missing id/promptName, wrong type) rejected (no row, no audit event); duplicate step id within the list rejected

---

## Phase 4: User Story 2 — Browse workflows (P1)

**Goal**: A user can list workflows filtered by user, project, or organization, scoped by their own authorization level (self-or-admin).

**Independent Test**: Create several workflows with different owners and project scopes; confirm each filtered listing (by user, by project, by organization) returns exactly the expected set, ordered by most-recently-updated first. Confirm a non-admin cannot list another user's workflows or the whole organization.

- [X] T007 [US2] Create `src/bcs/workflow-orchestration/application/list-workflows.ts` — `listWorkflows(db, actingUser, filter: ListWorkflowsFilter)`, where `ListWorkflowsFilter` (defined in `domain/workflow.ts`, T003) is an explicit discriminated union — `{ scope: "self"; projectId?: string }`, `{ scope: "user"; userId: string; projectId?: string }`, `{ scope: "project"; projectId: string }`, `{ scope: "organization" }` — so every listing mode from FR-009/017/018 has one unambiguous shape (no optional-field guessing about what "no filter" means). Non-admin: only `scope: "self"` (optionally + `projectId`) is accepted; any other scope throws `NotAuthorizedError`. Admin: any scope accepted. Results ordered by `updatedAt desc`
- [X] T008 [P] [US2] Create `src/bcs/workflow-orchestration/application/list-workflows.test.ts` — tests: `scope: "self"` returns only own workflows; admin `scope: "project"` returns only that project's workflows regardless of owner; admin `scope: "organization"` returns every org workflow and none from other orgs; empty org returns empty list (not an error); results ordered most-recently-updated first; non-admin passing `scope: "user"` (even for a different user) rejected; non-admin passing `scope: "organization"` or `scope: "project"` rejected

---

## Phase 5: User Story 3 — Edit a workflow's definition (P2)

**Goal**: A workflow's owner (or an org admin) can update its name, description, and/or steps; identity/organization/project scope never change; partial updates leave omitted fields untouched.

**Independent Test**: Create a workflow, update its name, description, and steps; confirm the retrieved workflow reflects the new values while its identity, organization, owner, and project scope are unchanged. Attempt an update as a non-owner, non-admin user; confirm rejection with no changes and no audit event.

- [X] T009 [US3] Create `src/bcs/workflow-orchestration/application/update-workflow.ts` — `updateWorkflow(db, actingUser, workflowId, fields, auditContext?)`: fetches by org+id (`WorkflowNotFoundError` if missing), authorizes self-or-admin (`NotAuthorizedError` otherwise), validates `fields.steps` via `validateWorkflowSteps` when provided, applies only the provided fields via `withAudit` + `record` with action `workflow.updated`
- [X] T010 [P] [US3] Create `src/bcs/workflow-orchestration/application/update-workflow.test.ts` — tests: owner updates name+description with audit event, updatedAt advances; owner replaces steps with audit event; malformed step in update rejected (stored workflow unchanged, no audit event); non-owner non-admin update rejected (stored workflow unchanged, no audit event); org admin (not owner) update succeeds with audit event; update omitting a field leaves that field's stored value unchanged; organization/owner/project scope cannot be changed by update (not accepted by the `fields` type); **cross-org negative test (Constitution M1-M3)**: an actingUser in org A attempting to update a workflow id that exists but belongs to org B throws `WorkflowNotFoundError` (cross-org denial is indistinguishable from not-found, matching this repo's established RLS-era convention), not a silent success or a different error

---

## Phase 6: Polish & Cross-Cutting

- [X] T011 Extend `src/bcs/workflow-orchestration/index.ts` (currently `export {}`) to re-export `createWorkflow`, `listWorkflows`, `updateWorkflow`, and all public types/errors from `domain/workflow.ts`
- [X] T012 Generate and apply Drizzle migration for `workflow.workflows` (rename generated file/tag to this repo's `<timestamp>_workflow_workflows` convention; verify `_journal.json`'s `when` is not out of sequence with the prior entry)
- [X] T013 Run full test suite and fix any failures (`pnpm vitest run`)

---

## Dependencies

```
T002 → T003, T004 (schema needed by domain types' repo return shapes and by repo queries)
T003 → T004 (domain types needed by repo function signatures)
T004 → T005, T007, T009 (repo needed by all application functions)
T005 → T007, T009 (US2/US3 tests build on workflows US1 creates; not a hard code dependency, but sequenced this way)
T005...T010 → T011 (implementations needed before index re-export)
T011 → T012 → T013
```

## Parallel Execution

Within each phase, tasks marked `[P]` can run in parallel (different files, no shared incomplete dependency).

- Phase 3: T006 can run in parallel with nothing else in-phase (only one implementation + one test task).
- Phase 4: T008 likewise.
- Phase 5: T010 likewise.
- Across phases, US1/US2/US3 application files are all independent of each other once Phase 2 (T002–T004) is done — a builder could implement T005, T007, T009 in parallel if desired, though sequential (P1 → P1 → P2) is the safer default since US2/US3 both read workflow rows US1's tests already create fixtures for.

## Implementation Strategy

MVP = Phase 3 (US1: create workflows with org/project scoping and step validation). Phase 4 (US2: browse) is equally P1 priority per the spec and should ship in the same increment as US1 — a workflow that can be created but never listed delivers no value. Phase 5 (US3: edit) is P2 and can follow as a second increment.
