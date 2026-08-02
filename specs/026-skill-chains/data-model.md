# Data Model: Skill Chains

## `prompt_registry.prompt_versions` (extended)

Existing columns unchanged (`id`, `promptId`, `version`, `systemTemplate`, `userTemplate`, `inputSchema`, `tags`, `createdAt`). Two new columns:

| Column | Type | Notes |
|---|---|---|
| `kind` | `text`, enum `["template", "chain"]` | `NOT NULL DEFAULT 'template'`. Explicit discriminant (never inferred from null-ness of other columns). Set by `publishVersion` from which shape the caller provided; never a caller-supplied field directly. |
| `steps` | `jsonb` | Nullable. `null` for a `kind: "template"` row. An array of `ChainStep` (below) for a `kind: "chain"` row. Immutable once inserted, like every other column on this table. |

**Validation** (domain, `determinePromptVersionKind`, called by `publishVersion` before insert):
- `steps` given (non-undefined) **and** `systemTemplate`/`userTemplate` given (non-null) → reject (`InvalidVersionShapeError`).
- Neither `steps` nor `systemTemplate`/`userTemplate` given at all → reject (`InvalidVersionShapeError`).
- Otherwise: `kind = "chain"` if `steps` given, else `kind = "template"`.

No index changes — `kind` is not currently queried independently of `promptId`+`version` lookups or full-row reads.

## `ChainStep` (domain type, stored inside `prompt_versions.steps`)

```ts
interface ChainStep {
  id: string;              // unique within the chain (validated at run start, not publish time)
  promptName: string;      // matched by name only against Prompt Registry — never resolved/validated at publish time
  promptVersion?: string;  // omitted = resolve the target skill's current active version at run time
  dependsOn: string[];     // other steps' `id`s this step's input depends on
}
```

No `organizationId`/DB row of its own — this is a plain JSON value inside `prompt_versions.steps`, matching the same "immutable JSON payload" treatment `inputSchema`/`tags` already get on this table.

## `prompt_registry.skill_chain_runs` (new)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` primary key | `id()` helper (client- or DB-generated random uuid) |
| `organization_id` | `uuid not null` | `organizationId()` helper. Direct RLS policy column. |
| `prompt_id` | `uuid not null`, FK → `prompts.id` (cascade) | The chain skill being run |
| `prompt_version_id` | `uuid not null`, FK → `prompt_versions.id` (cascade) | The exact chain version resolved at start time — pins which immutable `steps` list this run walks. Never re-resolved from the skill's current active version on a later `advanceSkillChainRun` call, so a newer chain version published mid-run never affects an already-started run. (Added during implementation — the original design omitted this column, then needed it to know a run's full step list without re-deriving it; caught before the migration was applied anywhere.) |
| `user_id` | `uuid not null` | The user who called `startSkillChainRun` — informational (audit/history), **not** an authorization gate on later `advanceSkillChainRun`/`abandonSkillChainRun` calls (clarify-session answer: any org member with access to the skill may advance/resume, not only the starter) |
| `status` | `text`, enum `["in_progress", "completed", "failed", "abandoned"]`, not null, default `"in_progress"` | |
| `current_step_index` | `integer not null default 0` | The step index the caller must report on next (for a completed zero-step run, stays `0`, meaningless since no step ever resolved) |
| `started_at` | `timestamp with time zone not null default now()` | |
| `completed_at` | `timestamp with time zone`, nullable | Set exactly once, when `status` transitions out of `"in_progress"` |

Indexes: `(organization_id, prompt_id, started_at)` (for `listSkillChainRuns`), `(organization_id, status)` (operational/debugging queries — a caller finding their own stuck `in_progress` runs).

No `updated_at` via the shared `timestamps()` helper — this table has its own explicit `started_at`/`completed_at` pair instead, since "when did this transition happen" is meaningfully different from a generic last-write timestamp (and the `timestamps()` helper's `updated_at` doesn't participate in this feature's own concurrency control, which uses row locking instead — see research.md).

## `prompt_registry.skill_chain_run_steps` (new)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` primary key | |
| `run_id` | `uuid not null`, FK → `skill_chain_runs.id` (cascade) | |
| `step_index` | `integer not null` | Position within the chain (matches the chain version's `steps` array index) |
| `prompt_name` | `text not null` | Denormalized copy of the chain step's `promptName` at resolution time — the run's own historical record, independent of whether the chain version is later superseded by a new published version |
| `prompt_version` | `text not null` | The **actual resolved** version string (never left as "unspecified" even if the chain step didn't pin one — resolved to whatever `expand()` actually used, so history is always concrete) |
| `resolved_at` | `timestamp with time zone not null default now()` | When this step's content was produced (i.e., when it was returned to the caller) |
| `system_message` | `text`, nullable | Exactly what `expand()` returned for this step |
| `user_message` | `text not null` | Exactly what `expand()` returned for this step |
| `applied_policies` | `jsonb not null default '[]'` | `string[]` — policy names, from `expand()`'s `appliedPolicies` |
| `objectives` | `jsonb not null default '[]'` | `string[]` — resolved objective titles, from `expand()`'s `objectives` |
| `reported_status` | `text`, enum `["success", "error"]`, nullable | `NULL` until the caller advances past this step (or forever, if the run is abandoned while this step is still pending) |
| `reported_output` | `text`, nullable | The caller's opaque self-reported result — never parsed, never validated. A value exceeding 64 KB is rejected outright before any write, never truncated (FR-014, `ReportOutputTooLargeError` — see research.md). `NULL` when the caller reported no output, when the step errored, or when the step was never reported at all. |
| `reported_error` | `text`, nullable | Caller-supplied error detail when `reported_status = "error"` |

Indexes: `(run_id, step_index)` unique (one row per step per run, and the natural lookup key for "the pending step"), enforced as `unique("skill_chain_run_steps_run_id_step_index_unique")`.

**Never a model's actual response** — confirmed by this shape itself: nothing here stores what a model generated for a step, only what was *sent* (`system_message`/`user_message`) and what the caller *self-reported* (`reported_status`/`reported_output`/`reported_error`). This is the literal data-level enforcement of spec FR-015.

## Application-facing types (domain layer, not DB rows)

```ts
type RunStatus = "in_progress" | "completed" | "failed" | "abandoned";

interface ChainStepReport {
  stepIndex: number; // which step this report is for — required for conflict detection (FR-007a, research.md)
  status: "success" | "error";
  output?: string;   // capped at 64 KB; opaque
  error?: string;
}

interface ChainStepResolution {
  stepId: string;
  stepIndex: number;
  promptName: string;
  promptVersion: string;
  systemMessage: string | null;
  userMessage: string;
}

// Union return types (see plan.md Complexity Tracking #2)
type StartRunResult =
  | { runId: string; step: ChainStepResolution }
  | { runId: string; done: true };

type AdvanceRunResult =
  | { step: ChainStepResolution }
  | { done: true };

interface ChainRunSummary {
  id: string;
  promptId: string;
  userId: string;
  status: RunStatus;
  currentStepIndex: number;
  startedAt: Date;
  completedAt: Date | null;
}

interface ChainRunStepRecord {
  id: string;
  runId: string;
  stepIndex: number;
  promptName: string;
  promptVersion: string;
  resolvedAt: Date;
  systemMessage: string | null;
  userMessage: string;
  appliedPolicies: string[];
  objectives: string[];
  reportedStatus: "success" | "error" | null;
  reportedOutput: string | null;
  reportedError: string | null;
}
```

## State transitions — `skill_chain_runs.status`

```
                    (zero steps)
                 ┌────────────────────► completed
                 │
  [start] ──► in_progress ──[advance: last step, all succeeded]──► completed
                 │      │
                 │      └──[advance: last step, any step ever "error"]──► failed
                 │
                 └──[abandon]──► abandoned
```

`in_progress` is the only non-terminal state. Every other state is terminal — `advanceSkillChainRun`/`abandonSkillChainRun`/`startSkillChainRun`-again against a terminal run's id is rejected (FR-007b). No transition ever leaves `in_progress` and returns to it.
