# Governance — Ownership

**Owner:** Ben Anderson

## Folder Ownership

| Path | Ownership level |
|---|---|
| `/bcs/governance/` | Full |
| `src/bcs/governance/` (resolution engine, application services) | Full |
| `src/app/(app)/teams/*/policies`, `/objectives` (UI) | Full |

## Database Ownership

Postgres schema: `governance`

| Schema / Table | Notes |
|---|---|
| `governance.policies` | Always attached to `team_id` — no `project_id` (PDR-016); org-scoped via the owning team |
| `governance.objectives` | Attached to exactly one of `{team_id, project_id, user_id}`; supports its own `parent_objective_id` tree — unchanged by PDR-016 |

## Shared Resource Ownership

None.

## Dependencies (owned by others)

| Resource | Owned by BC |
|---|---|
| `getTeamChain(teamId)` | Identity & Access |
| Team/user existence checks (`Objective.projectId` validation goes through Prompt Registry's `getProject`) | Identity & Access, Prompt Registry |
