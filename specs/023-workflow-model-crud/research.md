# Research: Workflow Model & CRUD

No `NEEDS CLARIFICATION` markers remain in the Technical Context — this feature's shape (a new bounded context following an already-established pattern) has no open technology questions. The items below record the concrete precedents this plan is built on.

## Decision: Bounded context skeleton already exists — extend, don't scaffold

`src/bcs/workflow-orchestration/` already exists with empty `domain/`, `application/`, `infrastructure/` folders (`.gitkeep` only), a barrel (`index.ts`, currently `export {}`), and `CONTRACT.md`/`OWNERSHIP.md` already written (documenting `createWorkflow`/`updateWorkflow`/`listWorkflows`, `workflow.workflows` table, dependency on Prompt Registry's `expand()`).

- **Rationale**: This is the standard state of a not-yet-built bounded context in this repo (same shape `prompt-registry` and `governance` started from). No new folders/contract docs are needed — only filling them in.
- **Alternatives considered**: None — the skeleton is prescriptive.

## Decision: Reuse `identity-access`'s `UserSummary` as the actor type

`UserSummary` (`{ id, orgId, teamId, role, email }`) is exported from `identity-access`'s public barrel and is already the shared actor shape used by peer self-or-admin functions (`revokeApiKey`, `listApiKeys`, `listInvitations`).

- **Rationale**: The spec's own Assumptions section names these three functions as the direct precedent for this feature's authorization model. Reusing the same actor type keeps the call shape identical for any future Distribution route handler wiring both up.
- **Alternatives considered**: A workflow-orchestration-local `WorkflowActor` type (as `prompt-registry` does with `ProjectActor`/`PromptActor`). Rejected: those BC-local actor types exist because those functions only ever need `{ organizationId, userId }`, not a role. This feature's authorization checks need `role` on every call (list and update both branch on admin vs. self), so the full `UserSummary` is a better fit and avoids a redundant parallel type.

## Decision: Org-boundary check for project scoping goes through `prompt-registry`'s exported `getProject`

FR-003 requires rejecting a workflow scoped to a project outside the caller's organization. `prompt-registry` exports `getProject(db, organizationId, projectId)` (already org-scoped internally — returns `undefined` if the project doesn't belong to that org).

- **Rationale**: Matches `OWNERSHIP.md`'s own "Dependencies (owned by others)" table (`User/project existence | Identity & Access, Prompt Registry`) and the constitution's D1 principle (no direct cross-BC model imports — only through the owning BC's contract).
- **Alternatives considered**: Querying `prompt_registry.projects` directly from `workflow-orchestration`'s infrastructure layer. Rejected — a direct schema import across bounded contexts is exactly what D1 forbids and `eslint-plugin-boundaries` blocks.

## Decision: Step validation lives entirely in the domain layer, is structural only

FR-004–FR-008 describe exactly what must and must not be validated: step id present and unique within the list, prompt name present, dependency list well-typed — but never prompt-existence or cycle-freedom (both deferred to the not-yet-built workflow-runner feature).

- **Rationale**: Constitution D2 — domain invariants belong in the domain layer, enforced once, not re-implemented per call site. `create-workflow.ts` and `update-workflow.ts` both need identical step validation; putting it in `domain/workflow.ts` as a single `validateWorkflowSteps()` function (mirroring `prompt-registry/domain/project-skill-assignment.ts`'s validation-function style) means both call sites share one implementation.
- **Alternatives considered**: A Zod schema. Rejected as an unnecessary new dependency — no other bounded context in this codebase uses a schema-validation library for this kind of shape check; plain TypeScript type guards are the established pattern (see `identity-access/domain/api-key.ts`'s `isValidScopeShape`).

## Decision: `steps` stored as a single `jsonb` column, not a normalized child table

The legacy Python model stores `steps` as JSON on the `Workflow` row itself (no child table), and the spec's Key Entities section describes `Workflow Step` as "not independently addressable outside its parent workflow."

- **Rationale**: Matches source behavior 1:1 (per the spec's explicit porting intent) and avoids a needless normalization the domain doesn't call for — steps are always read/written as one ordered unit with their parent workflow, never queried independently. Matches this repo's own `prompt_registry.prompts.tags`/`input_schema` jsonb-column precedent for structured-but-opaque-to-SQL data.
- **Alternatives considered**: A `workflow_steps` child table (one row per step). Rejected — no requirement ever queries a step independently of its workflow, and per-step, per-run history already has its own dedicated future table (`workflow.workflow_runs`, per `OWNERSHIP.md`, owned by the runner feature, not this one).

## Decision: No Postgres RLS in this feature

`OWNERSHIP.md` names `workflow.workflows` as this feature's only table; RLS for it is not in this feature's Acceptance Criteria or Functional Requirements.

- **Rationale**: Matches `prompt_registry`'s own established precedent — `018-prompt-version-model` shipped `prompts`/`prompt_versions` with no RLS, deferring it to a dedicated `005-prompt-registry-tenant-isolation-tests.md` feature once sharing/assignment tables existed. `backlog/007-workflow-orchestration/003-workflow-tenant-isolation-tests.md` is the equivalent dedicated future item for this epic.
- **Alternatives considered**: Adding RLS inline. Rejected — application-layer org-scoping (M1–M3's primary control) is this feature's actual gate; bundling RLS in now would duplicate work when `003-workflow-tenant-isolation-tests.md` is built and diverge from the sibling BC's own precedent.
