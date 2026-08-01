# Data Model: Workflow Model & CRUD

## Entities

### Workflow (`workflow.workflows`)

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `id` | UUID PK | No | `defaultRandom()` via shared `id()` helper |
| `organization_id` | UUID | No | Tenant scope — via shared `organizationId()`. No FK (matches this codebase's established no-FK-on-`organization_id` precedent) |
| `user_id` | UUID | No | Owner. Fixed at creation (FR-013); no FK — user existence/org-membership is asserted by the caller already being an authenticated `UserSummary`, not re-verified against `identity-access` here |
| `project_id` | UUID | Yes | Optional scope, fixed at creation (FR-013). No FK (project lives in a different bounded context/schema — org-boundary is enforced at write time via `prompt-registry`'s `getProject`, not a DB constraint) |
| `name` | text | No | Required |
| `description` | text | Yes | Optional |
| `steps` | jsonb | No | Default `[]`. Ordered array of `WorkflowStep` (see below); typed via Drizzle's `.$type<WorkflowStepRow[]>()`, validated at the application layer, not the DB |
| `created_at` | timestamptz | No | `defaultNow()` |
| `updated_at` | timestamptz | No | `defaultNow()`, bumped on every update; drives FR-011's ordering |

**Indexes**:
- `INDEX(organization_id, user_id)` — self-scoped listing (FR-009, FR-017)
- `INDEX(organization_id, project_id)` — project-scoped listing (FR-009)
- `INDEX(organization_id, updated_at)` — org-wide listing ordered by most-recently-updated (FR-009, FR-011)

No `UNIQUE` constraint on `(organization_id, name)` — the spec places no uniqueness requirement on workflow names (unlike `prompts`/`projects`).

### WorkflowStep (embedded in `steps` jsonb, not its own table)

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `id` | string | No | Step identifier, unique within its parent workflow's step list (FR-005) |
| `promptName` | string | No | Matched by name only against Prompt Registry, never resolved at write time (FR-006) |
| `promptVersion` | string | Yes | Optional specific version; also not resolved at write time |
| `dependsOn` | string[] | No | Default `[]`. Other step ids this step depends on. Stored as submitted — never validated for cycles or that referenced ids exist (FR-007) |

Not independently addressable outside its parent workflow (per spec's Key Entities) — no repo function ever queries a single step; the whole array is always read/written as one unit with its parent `Workflow` row.

## Relationships

```
organization ──< workflows >── [project_id?] ──> project (prompt_registry, different schema — app-layer check only, no FK)
                 workflows.user_id            ──> user   (identity-access, different schema — no FK)
                 workflows.steps (jsonb array of WorkflowStep, embedded)
```

- One organization has many workflows (org-scoped)
- One workflow has exactly one owning user, fixed at creation
- One workflow optionally has one project scope, fixed at creation, which must belong to the same organization
- One workflow has zero or more ordered steps, stored inline

## Validation Rules (domain layer, `domain/workflow.ts`)

- `validateWorkflowSteps(input: unknown): WorkflowStep[]`
  - Accepts `undefined` → returns `[]` (FR-008: empty step list is valid)
  - Must be an array; each element must be an object with:
    - `id`: non-empty string
    - `promptName`: non-empty string
    - `promptVersion`: string or omitted
    - `dependsOn`: array of strings or omitted (normalized to `[]`)
  - Rejects (throws `InvalidWorkflowStepsError`) on: non-array input, any malformed element (missing/wrong-typed field), or two-or-more elements sharing the same `id` (FR-004, FR-005)
  - Never checks that `promptName` exists in Prompt Registry, and never checks `dependsOn` for cycles or unknown ids (FR-006, FR-007) — explicitly out of scope

## State Transitions

### Workflow lifecycle

```
[created] → updateWorkflow(name/description/steps) → [updated, updated_at advances]
```

- No delete transition (FR-016 — not exposed by this feature)
- No transition changes `organization_id`, `user_id`, or `project_id` (FR-013) — `updateWorkflow`'s field type only accepts `name`/`description`/`steps`, making the omission a compile-time guarantee rather than a runtime check
- A field omitted from an update call leaves its previously stored value unchanged (FR-012) — implemented as a `Partial`-typed fields object where only defined keys are included in the SQL `SET` clause

## Drizzle Schema Location

`src/bcs/workflow-orchestration/infrastructure/schema.ts` (new file) — first table in the already-declared, currently-empty `workflow` Postgres schema (`src/shared/db/schemas.ts`'s `workflowSchema`).
