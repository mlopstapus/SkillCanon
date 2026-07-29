# Prompt Registry — Ownership

**Owner:** Ben Anderson

## Folder Ownership

| Path | Ownership level |
|---|---|
| `/bcs/prompt-registry/` | Full |
| `src/bcs/prompt-registry/` (expansion engine, application services) | Full |
| `src/app/(app)/prompts/*`, `/projects/*` (UI) | Full |

## Database Ownership

Postgres schema: `prompt_registry`

| Schema / Table | Notes |
|---|---|
| `prompt_registry.projects` | Owner team via `team_id` (Identity); has cross-team members |
| `prompt_registry.project_members` | |
| `prompt_registry.project_teams` | Collaborator teams — many-to-many; the owner team is `projects.team_id`, not a row here (PDR-016) |
| `prompt_registry.prompts` | `(organization_id, name)` unique. `owner_type`/`owner_id` — exactly one of a user or a team, never a project (PDR-016) |
| `prompt_registry.prompt_versions` | Immutable once created — append-only |
| `prompt_registry.subscriptions` | Live-reference sharing; `(source_skill_id, subscriber_type, subscriber_id)` unique. Replaces the previously-planned `prompt_shares` (PDR-016) |
| `prompt_registry.project_skill_assignments` | `(project_id, skill_id)` unique; `requirement: "required" \| "optional"`. Read directly by VCS Integration's PR check — not a Governance policy (PDR-016) |

## Shared Resource Ownership

None.

## Dependencies (owned by others)

| Resource | Owned by BC |
|---|---|
| `resolveAllPolicies`, `resolveEffectiveObjectives` | Governance |
| `getTeamChain`, `listTeams`, `getTeam`, user/team existence | Identity & Access |
| Entitlement checks (e.g. version retention limits) | Billing & Entitlements |
