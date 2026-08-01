---
epic: 007-workflow-orchestration
feature: 001-workflow-model-and-crud
status: open
dependencies: ["backlog/002-identity-access/EPIC.md"]
---

# Workflow Model & CRUD

Port `Workflow` from the current Python `models.py`/`workflow_service.py`, scoped under `Organization`. A workflow is pure composition metadata — an ordered list of skill references and how each step's input maps from prior steps' outputs — never a record of execution; nothing in this feature calls `expand()` or a model.

## Requirements

- [ ] `workflow.workflows` table: `id`, `organization_id`, `user_id`, `project_id` (nullable), `name`, `description`, `steps` (jsonb), timestamps
- [ ] `steps` shape: an ordered array of `{ stepId, promptName, promptVersion? }` plus an `inputMapping` describing which prior step's reported output (if any) fills which of this step's `expand()` input variables — referencing prompt names, not IDs, matching current Python behavior. This is composition metadata only; it is validated for shape here but not resolved against Prompt Registry until a step is actually walked at run time (`002-workflow-runner.md`)
- [ ] Invariant: `project_id`, if set, must belong to the same `organization_id`
- [ ] CRUD: create, update, list workflows (by user/project/org)

## Acceptance Criteria

- [ ] Creating a workflow scoped to a project from a different organization is rejected
- [ ] Every mutation produces a corresponding audit event

## Open Questions

- None currently.

## Dependencies

- `backlog/002-identity-access/EPIC.md`

## Technical Notes

`steps`/`inputMapping` describe *how* to resolve each step, not what any step produced — actual per-step resolution and the client-reported outputs used to satisfy `inputMapping` at run time live entirely in `002-workflow-runner.md`, never here.
