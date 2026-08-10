---
epic: 006-prompt-registry
feature: 009-skill-chains
status: done
dependencies: ["archive/004-expansion-engine.md", "archive/007-project-skill-assignment.md"]
supersedes: ["backlog/007-workflow-orchestration/001-workflow-model-and-crud.md", "backlog/007-workflow-orchestration/002-workflow-runner.md", "backlog/007-workflow-orchestration/003-workflow-tenant-isolation-tests.md"]
---

# Skill Chains

Per [PDR-017](../../docs/pdr/017-fold-workflow-orchestration-into-prompt-registry.md): a "workflow" is not a separate domain concept from a skill — it's a skill whose version happens to be an ordered list of steps instead of a template. This feature adds that second version kind to Prompt Registry directly, and the client-driven, step-by-step execution loop that walks it, replacing the standalone `workflow-orchestration` bounded context that `007-workflow-orchestration/001-workflow-model-and-crud.md` and `002-workflow-runner.md` originally speced.

Lets a caller (Claude Code, another IDE agent, the web UI) walk a **chain version**'s steps one at a time, each resolved through this same BC's `expand()`. Prompt Registry never executes a step against a model and never sees a step's real output — only the caller does that, the same way `sh-run` already works for a template version. "Running" a chain is a client-driven loop: resolve step *N*, the caller runs it against whatever model/agent it's using, the caller reports back what downstream steps need to see, then asks for step *N+1*.

## Requirements

### Chain versions

- [x] `publishVersion` accepts `{ steps }` as an alternative to `{ systemTemplate?, userTemplate? }` — a **chain version**. Exactly one of the two shapes is accepted per version; a version mixing both, or specifying neither, is rejected. A `PromptVersionSummary`'s kind (template vs. chain) is an explicit discriminant, not inferred from which fields happen to be null.
- [x] Each step: `{ id, promptName, promptVersion?, dependsOn: string[] }` — `id` unique within the chain, `promptName` matched by name only against Prompt Registry (never resolved or validated for existence at publish time), `dependsOn` stored as submitted (never validated for cycles or that referenced ids exist at publish time — see the run-time validation below).
- [x] Like every other prompt version, a chain version is immutable once published — editing a chain's steps means publishing a new version, exactly like editing a template's content does.
- [x] A chain version, like a template version, is owned by exactly one user or team, and gets the same versioning, sharing (`subscribeSkill`/`forkSkill`), and project-assignment capabilities every other skill gets — no new code needed for any of the three, since they already operate on `Prompt`/`PromptVersion` generically.

### Running a chain

- [x] `startSkillChainRun(db, actor, promptName, version?)`: creates a `skill_chain_runs` row (`status: "in_progress"`), resolves step 1 via `expand()`, returns `{ runId, step: SkillChainStepResolution }`. Rejects a workflow whose step dependencies reference a nonexistent step id, the step's own id, or a step at the same or later position (validated once, here, since chain resolution order is strictly sequential by step position — never dependency-graph order) — before creating any run record.
- [x] `advanceSkillChainRun(db, actor, runId, report)`: records the caller's report for the just-resolved step (`status: "success" | "error"`, and an optional caller-supplied `output` value used only to satisfy the *next* step's `dependsOn` inputs — treated as opaque, never inspected or validated, capped at a reasonable size, default 64 KB) and returns either the next step's `SkillChainStepResolution` or `{ done: true }` once no steps remain.
- [x] A step reported as `"error"` does not silently let downstream steps proceed as if it succeeded — the next step's resolution receives `null`/an explicit error marker wherever a `dependsOn` reference would have used that step's output, matching `bcs/prompt-registry/CONTRACT.md`'s stability guarantee. Prompt Registry does not decide success/failure itself; it only propagates what the caller reported.
- [x] A run reaching its last step is marked `"completed"` if every step succeeded, `"failed"` if any step was reported `"error"`. A caller may explicitly end an in-progress run early, marking it `"abandoned"`.
- [x] A run for a chain with zero steps completes immediately with no step to resolve.
- [x] If `expand()` itself cannot resolve a step's content (e.g. the referenced prompt was deprecated after the chain was published), the run fails outright with a clear error — distinct from a caller-reported step failure, since no content could be produced or sent for that step.
- [x] `prompt_registry.skill_chain_runs` table (new): `id`, `prompt_id`, `organization_id`, `user_id`, `status` (`in_progress`/`completed`/`failed`/`abandoned`), `current_step_index`, `started_at`, `completed_at`
- [x] `prompt_registry.skill_chain_run_steps` table (new): `id`, `run_id`, `step_index`, `prompt_name`, `prompt_version`, `resolved_at`, `system_message`, `user_message`, `applied_policies` (jsonb), `objectives` (jsonb), `reported_status` (nullable until the caller advances past it), `reported_error` (nullable) — persists exactly what was sent for each step and what the caller self-reported; never a model's response, since this context never receives one.
- [x] RLS enabled on both new tables, following the same `skillcanon_app`/`skillcanon_auth` role split and cross-tenant-denial pattern already applied to every other `prompt_registry.*` table (`022-prompt-registry-tenant-isolation`) — no separate follow-up tenant-isolation feature needed since these tables are new, not retrofitted.
- [x] `SkillChainRunCompleted` / `SkillChainRunFailed` events fired when `advanceSkillChainRun` is called with no steps remaining (or the caller explicitly abandons the run), consumed by Audit and by Distribution (usage telemetry).
- [x] `listSkillChainRuns(db, orgId, promptId)` / `getSkillChainRun(db, orgId, runId)`: read-only query APIs returning run(s) plus their `skill_chain_run_steps` — for a viewer that never itself calls `startSkillChainRun`/`advanceSkillChainRun`, e.g. `010-skill-chain-views-ui.md`'s read-only run history page.

## Acceptance Criteria

- [x] A multi-step chain where the caller reports step 2 as `"error"`: step 3's resolution receives a `null`/explicit-error input wherever `dependsOn` referenced step 2's output, not stale or fabricated data.
- [x] A completed run is queryable afterward via `skill_chain_runs`/`skill_chain_run_steps`, including each step's resolved prompt content and the caller's self-reported outcome — this is new functionality beyond the current Python behavior (which discards all of it after the response is sent), verified by test.
- [x] `startSkillChainRun`/`advanceSkillChainRun` call `expand()`'s own internals directly (same-BC, not cross-BC) but never bypass the immutability/versioning rules every other prompt version follows.
- [x] Neither run function ever stores or returns anything resembling a model's response — only what was sent (`system_message`/`user_message`) and what the caller self-reported (`reported_status`/`reported_error`).
- [x] `listSkillChainRuns`/`getSkillChainRun` are pure reads — no `expand()` call, no state transition, safe for a UI to poll or load repeatedly.
- [x] A chain version published, then subscribed-to/forked by another team, works with zero new code — proving the "inherits sharing for free" claim in PDR-017.
- [x] Cross-org access to a chain run or its step history by ID is denied, proven by test (RLS + app-layer).

## Open Questions

- Is a client-abandoned run (caller stops calling `advanceSkillChainRun` and never reports back) ever transitioned out of `in_progress` automatically, or does it stay open until a future call resumes or explicitly abandons it? No time-based expiry is assumed by default.

## Dependencies

- `archive/004-expansion-engine.md` (chain steps resolve through the same `expand()` this feature already owns)
- `archive/007-project-skill-assignment.md` (chain versions participate in project assignment the same as template versions)

## Technical Notes

Carries forward the requirements and acceptance criteria from `backlog/007-workflow-orchestration/001-workflow-model-and-crud.md`, `002-workflow-runner.md`, and the tenant-isolation piece of `003-workflow-tenant-isolation-tests.md` — re-homed onto `Prompt`/`PromptVersion` per [PDR-017](../../docs/pdr/017-fold-workflow-orchestration-into-prompt-registry.md) rather than a standalone `Workflow` entity. `007-workflow-orchestration/004-workflow-sharing.md`'s entire scope (grant a specific user/team access to a chain) is already satisfied with zero new code by this BC's existing `subscribeSkill`/`forkSkill` — no replacement backlog item needed for it. The `workflow.*` Postgres schema and `src/bcs/workflow-orchestration/` code (shipped by the now-superseded `001-workflow-model-and-crud`) are retired as part of implementing this feature, not left running alongside it.
