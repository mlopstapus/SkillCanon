---
epic: 007-workflow-orchestration
feature: 002-workflow-runner
status: open
dependencies: ["001-workflow-model-and-crud.md", "backlog/006-prompt-registry/004-expansion-engine.md"]
---

# Workflow Runner

Lets a caller (Claude Code, another IDE agent, the web UI) walk a workflow's steps one at a time, each resolved through Prompt Registry's `expand()`. SkillCanon never executes a step against a model and never sees a step's real output — only the caller does that, the same way `sh-run` already works for a single skill. "Running" a workflow is therefore a client-driven loop, not a server-side executor: resolve step *N*, the caller runs it against whatever model/agent it's using, the caller reports back what downstream steps need to see, then asks for step *N+1*.

## Requirements

- [ ] `startWorkflowRun(orgId, workflowId, userId)`: creates a `workflow_runs` row (`status: "in_progress"`), resolves step 1 via `expand()`, returns `{ runId, step: WorkflowStepResolution }`
- [ ] `advanceWorkflowRun(orgId, runId, report)`: records the caller's report for the just-resolved step (`status: "success" | "error"`, and an optional caller-supplied `output` value used only to satisfy the *next* step's `inputMapping` — SkillCanon treats it as an opaque string, never inspects or validates it) via `expand()`, and returns either the next step's `WorkflowStepResolution` or a final `{ done: true }` once no steps remain
- [ ] A step reported as `"error"` does not silently let downstream steps proceed as if it succeeded — the next step's resolution receives `null`/an explicit error marker wherever `inputMapping` would have used that step's output, matching `bcs/workflow-orchestration/CONTRACT.md`'s stability guarantee. SkillCanon does not decide success/failure itself; it only propagates what the caller reported
- [ ] `workflow.workflow_runs` table (new): `id`, `workflow_id`, `organization_id`, `user_id`, `status` (`in_progress`/`completed`/`failed`/`abandoned`), `current_step_index`, `started_at`, `completed_at`
- [ ] `workflow.workflow_run_steps` table (new): `id`, `run_id`, `step_index`, `prompt_name`, `prompt_version`, `resolved_at`, `system_message`, `user_message`, `applied_policies` (jsonb), `objectives` (jsonb), `reported_status` (nullable until the caller advances past it), `reported_error` (nullable) — persists exactly what SkillCanon sent for each step and what the caller self-reported about it; never a model's response, since SkillCanon never receives one
- [ ] `WorkflowRunCompleted` / `WorkflowRunFailed` events per `bcs/workflow-orchestration/CONTRACT.md`, fired when `advanceWorkflowRun` is called with no steps remaining (or the caller explicitly abandons the run), consumed by Audit and by Distribution (usage telemetry)
- [ ] `listWorkflowRuns(orgId, workflowId)` / `getWorkflowRun(orgId, runId)`: read-only query APIs returning run(s) plus their `workflow_run_steps` (resolved content + self-reported outcome per step) — for a viewer that never itself calls `startWorkflowRun`/`advanceWorkflowRun`, e.g. `005-workflow-views-ui.md`'s read-only run history page

## Acceptance Criteria

- [ ] A multi-step workflow where the caller reports step 2 as `"error"`: step 3's resolution receives a `null`/explicit-error input wherever `inputMapping` referenced step 2's output, not stale or fabricated data — matching the CONTRACT.md guarantee
- [ ] A completed run is queryable afterward via `workflow_runs`/`workflow_run_steps`, including each step's resolved prompt content and the caller's self-reported outcome — this is new functionality beyond the current Python behavior (which discards all of it after the response is sent), verified by test
- [ ] `startWorkflowRun`/`advanceWorkflowRun` call `expand()` through Prompt Registry's contract only — no direct import of Prompt Registry internals (module-boundary lint passes)
- [ ] Neither function ever stores or returns anything resembling a model's response — only what was sent (`system_message`/`user_message`) and what the caller self-reported (`reported_status`/`reported_error`)
- [ ] `listWorkflowRuns`/`getWorkflowRun` are pure reads — no `expand()` call, no state transition, safe for a UI to poll or load repeatedly

## Open Questions

- Should `advanceWorkflowRun`'s caller-supplied `output` be size-capped (it's stored opaquely in no table today — only used transiently to satisfy the next step's `inputMapping`, per the requirements above; confirm nothing persists it beyond that single resolution call before implementation)
- Is a client-abandoned run (caller stops calling `advanceWorkflowRun` and never reports back) ever transitioned out of `in_progress` automatically, or does it stay open until a future call resumes or explicitly abandons it? No time-based expiry is assumed by default

## Dependencies

- `001-workflow-model-and-crud.md`
- `backlog/006-prompt-registry/004-expansion-engine.md`

## Technical Notes

The `workflow_runs`/`workflow_run_steps` persistence is a deliberate, called-out improvement over the current Python behavior (see `bcs/workflow-orchestration/OWNERSHIP.md`) — not scope creep, since it directly supports debugging and the audit story the rest of this architecture is built around. It is scoped strictly to what SkillCanon actually knows (what it sent, what the caller self-reported), never to a model's real output, which SkillCanon has no way to observe.
