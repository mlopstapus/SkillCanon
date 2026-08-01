---
epic: 007-workflow-orchestration
feature: 005-workflow-views-ui
status: open
dependencies: ["002-workflow-runner.md", "003-workflow-tenant-isolation-tests.md", "004-workflow-sharing.md", "backlog/004-app-shell-and-landing/002-app-shell-and-navigation.md"]
---

# Workflow Views UI

The real, finished workflow list/creation/detail UI — owned by this BC per `bcs/workflow-orchestration/OWNERSHIP.md` (`src/app/(app)/workflows/*`) — composed into the shared shell from `004-app-shell-and-landing/002-app-shell-and-navigation.md`, with real design applied directly rather than deferred to a later redesign pass, mirroring `003-audit-compliance/003-audit-log-ui.md` and `005-governance/005-governance-views-ui.md`.

**Status (2026-07-23): no Claude design mockup exists yet for these pages.** Pull the corresponding mockup(s) via the `claude_design` MCP server first and run the same gap-analysis pass against `001-workflow-model-and-crud.md`/`002-workflow-runner.md`/`004-workflow-sharing.md` before finalizing this file's Requirements — don't invent them from a description.

## Requirements

- [ ] Pull the workflows mockup(s) from claude.ai/design before finalizing the rest of this list
- [ ] `workflows` (list), `workflows/new`, `workflows/[id]` (detail, including run history) — page inventory carried over from the now-dissolved `010-ui-polish-and-accessibility` epic's original redesign scope; confirm against the actual mockup once it exists
- [ ] `workflows/[id]`'s run history is **read-only**, sourced entirely from `listWorkflowRuns`/`getWorkflowRun` (`002-workflow-runner.md`) — resolved step content (`system_message`/`user_message`) and each step's caller-self-reported status. There is no "run" action anywhere in this UI; the web UI never calls `startWorkflowRun`/`advanceWorkflowRun` and has no way to show a model's actual response, since SkillCanon itself never receives one — real runs happen entirely client-side in whatever agent (Claude Code, another IDE) is executing the workflow

## Acceptance Criteria

- [ ] Create and view a workflow, and view its run history step by step, works end-to-end through this UI
- [ ] Step sequencing and each step's self-reported status are clearly legible; the UI never implies it is showing a model's real response, and exposes no control that starts or advances a run
- [ ] The page(s) visually match whatever mockup is pulled in

## Open Questions

- Which mockup file(s) cover these pages — none were found alongside the three existing mockups (Audit, Governance, Landing) as of 2026-07-23.

## Dependencies

- `002-workflow-runner.md`
- `003-workflow-tenant-isolation-tests.md`
- `004-workflow-sharing.md`
- `backlog/004-app-shell-and-landing/EPIC.md`

## Technical Notes

Confirmed 2026-07-31: this page is read-only history, not a run trigger. Per `002-workflow-runner.md`, SkillCanon never executes a step or observes a model's output — this page can only present what was resolved/sent per step and what the calling agent self-reported, never a real model response. Uses `listWorkflowRuns`/`getWorkflowRun` only; never `startWorkflowRun`/`advanceWorkflowRun`.
