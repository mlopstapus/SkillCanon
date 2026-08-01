# Workflow Orchestration — Ownership

**Owner:** Ben Anderson

## Folder Ownership

| Path | Ownership level |
|---|---|
| `/bcs/workflow-orchestration/` | Full |
| `src/bcs/workflow-orchestration/` | Full |
| `src/app/(app)/workflows/*` (UI) | Full |

## Database Ownership

Postgres schema: `workflow`

| Schema / Table | Notes |
|---|---|
| `workflow.workflows` | `steps` as jsonb; org + optional project scoped |
| `workflow.workflow_runs` | **New** vs. the current Python model — persists run-level status/timing instead of discarding it after the response is sent |
| `workflow.workflow_run_steps` | **New** — persists what was actually resolved/sent per step (`system_message`/`user_message`/`applied_policies`/`objectives`) and the caller's self-reported outcome for it. Never a model's real response — this context has no way to observe one |

## Shared Resource Ownership

None.

## Dependencies (owned by others)

| Resource | Owned by BC |
|---|---|
| `expand()` | Prompt Registry |
| User/project existence | Identity & Access, Prompt Registry |
