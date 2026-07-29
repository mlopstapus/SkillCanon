---
epic: 006-prompt-registry
feature: 001-project-model-and-membership
status: open
dependencies: ["backlog/002-identity-access/EPIC.md"]
---

# Project Model & Membership

Port `Project` and `ProjectMember` from the current Python `models.py`/`project_service.py` — a team-owned workspace with cross-team members, scoped under `Organization` — and add collaborator-team support: a project has one owner team (admin rights) plus any number of collaborator teams ([PDR-016](../../docs/pdr/016-skill-ownership-sharing-and-project-assignment.md), new relative to the original Python model).

## Requirements

- [ ] `prompt_registry.projects` table: `id`, `organization_id`, `team_id` (the **owner** team — admin rights: rename, manage collaborator teams, delete), `lead_user_id` (nullable), `name`, `slug`, `description`, timestamps
- [ ] `prompt_registry.project_members` table: `id`, `project_id`, `user_id`, `role`, `created_at`, unique on `(project_id, user_id)`
- [ ] `prompt_registry.project_teams` table (new): `id`, `project_id`, `team_id`, `created_at`, unique on `(project_id, team_id)` — **collaborator** teams; the owner team is `projects.team_id` and is never a row in this table
- [ ] Invariant: `team_id`, `lead_user_id`, every member's `user_id`, and every collaborator `team_id` must belong to the project's `organization_id`
- [ ] Invariant: a team cannot be added as a collaborator on a project it already owns (`project_teams.team_id != projects.team_id` for that project)
- [ ] CRUD: create project, add/remove member, add/remove collaborator team (owner-team-admin only), update project, list projects by team/org (a "team's projects" query matches on **either** owner or collaborator)

## Acceptance Criteria

- [ ] Adding a member from a different organization is rejected
- [ ] `(project_id, user_id)` uniqueness enforced — can't add the same member twice
- [ ] Adding a collaborator team from a different organization is rejected
- [ ] `(project_id, team_id)` uniqueness enforced on collaborator teams — can't add the same team twice, and the owner team can't also be added as a collaborator
- [ ] `listProjectsByTeam` for a team that is only a collaborator (not the owner) on a project still includes that project
- [ ] Every mutation produces a corresponding audit event

## Open Questions

- None currently.

## Dependencies

- `backlog/002-identity-access/EPIC.md`

## Technical Notes

Cross-team membership within the same org is intentional (matches current Python model) — only cross-*organization* membership is invalid, per M1. Collaborator teams are what let a project draw skills from more than one team's catalog — see `007-project-skill-assignment.md`, which depends on this feature for the owner/collaborator team list.
