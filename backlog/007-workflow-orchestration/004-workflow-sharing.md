---
epic: 007-workflow-orchestration
feature: 004-workflow-sharing
status: open
dependencies: ["001-workflow-model-and-crud.md"]
---

# Workflow Sharing

Port `WorkflowShare` from the current Python `models.py`/`workflow_service.py` (`share_workflow`, `unshare_workflow`, `list_workflow_shares`) — grants a specific user access to a workflow they don't own, mirroring Prompt Registry's `PromptShare` (`006-prompt-registry/003-prompt-sharing.md`). This was missed in the original epic breakdown — caught by cross-referencing `context/existing-feature-inventory.md` against the current app's actual routes (`POST/GET/DELETE /workflows/{id}/shares`).

## Requirements

- [ ] `workflow.workflow_shares` table: `id`, `workflow_id`, `user_id`, `created_at`, unique on `(workflow_id, user_id)`
- [ ] Invariant: shared-with `user_id` must belong to the same `organization_id` as the workflow — no cross-org sharing
- [ ] Create share, revoke share, list a workflow's shares
- [ ] A user's "accessible workflows" list (used by `listWorkflows` in `001-workflow-model-and-crud.md`) includes both owned and shared-with workflows

## Acceptance Criteria

- [ ] Attempting to share a workflow with a user from a different organization is rejected
- [ ] A shared-with user can start/advance a run against the workflow via `startWorkflowRun`/`advanceWorkflowRun`; a user with no ownership or share cannot
- [ ] Revoking a share removes the workflow from that user's accessible list

## Open Questions

- None currently.

## Dependencies

- `001-workflow-model-and-crud.md`

## Technical Notes

Structurally identical to `006-prompt-registry/003-prompt-sharing.md` — reuse that feature's implementation pattern rather than designing sharing access control twice.
