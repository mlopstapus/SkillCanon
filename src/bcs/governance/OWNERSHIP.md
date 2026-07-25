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
| `governance.policies` | Attached to exactly one of `{team_id, project_id}`; org-scoped via the owning team/project |
| `governance.objectives` | Same scoping rule; supports its own `parent_objective_id` tree |

## Shared Resource Ownership

None.

## Dependencies (owned by others)

| Resource | Owned by BC |
|---|---|
| `getTeamChain(teamId)` | Identity & Access |
| `getProject(orgId, projectId)` — used only by `resolveRequiredSkillPolicies` to find a project's owning team | Prompt Registry |
| Team/project/user existence checks | Identity & Access, Prompt Registry |
