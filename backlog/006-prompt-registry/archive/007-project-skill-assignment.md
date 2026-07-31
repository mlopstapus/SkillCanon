---
epic: 006-prompt-registry
feature: 007-project-skill-assignment
status: done
dependencies: ["001-project-model-and-membership.md", "003-prompt-sharing.md"]
---

# Project Skill Assignment

New capability (no Python precedent) — a project picks which skills from its participating teams' catalogs apply to it, marking each `required` or `optional`. This is a plain Prompt Registry catalog fact, not a Governance policy: it replaced the originally-speced `Policy.enforcementType: "require-skill"` / `resolveRequiredSkillPolicies` design once skill ownership stopped being project-derived ([PDR-016](../../docs/pdr/016-skill-ownership-sharing-and-project-assignment.md)). `listRequiredSkillsForProject` is what VCS Integration's PR check reads directly.

Delivered by `specs/022-project-skill-assignment/`, which also pulled forward `001`'s still-unbuilt collaborator-team capability (`project_teams`) as part of the same feature — see that spec's Clarifications and `001`'s own updated Technical Notes.

## Requirements

- [X] `prompt_registry.project_skill_assignments` table: `id`, `organization_id`, `project_id`, `skill_id`, `requirement` (`"required" | "optional"`), `created_at`, unique on `(project_id, skill_id)`
- [X] `assignSkillToProject(db, actingUser, projectId, skillId, { requirement }, auditContext?)` — rejected unless `skillId`'s `owner_id` is the project's owner team **or** one of its collaborator teams (via `001`'s `project_teams`); a personal (`owner_type: "user"`) skill is always rejected here regardless of who the user is
- [X] `unassignSkillFromProject(db, actingUser, projectId, skillId, auditContext?)`
- [X] `listRequiredSkillsForProject(db, orgId, projectId)` — flat list of skill names where `requirement = "required"`, no team-chain resolution, a direct read
- [X] `listPrompts(db, actor, { projectId })` (extends feature 003's accessible-skills query) — when `projectId` is given, also includes every skill assigned to that project regardless of which participating team contributed it, provided the caller is a project member

## Acceptance Criteria

- [X] Assigning a skill owned by a team that is neither the project's owner nor a collaborator is rejected
- [X] Assigning a personal (user-owned) skill directly to a project is rejected, even if the acting user is a project member
- [X] `listRequiredSkillsForProject` returns only `required` assignments, not `optional` ones
- [X] A project member who belongs to a *different* participating team than the one that contributed a given assignment still sees that skill in `listPrompts(..., { projectId })` — proves the access model's "project membership grants access to everything assigned" guarantee (PDR-016)
- [X] `(project_id, skill_id)` uniqueness enforced — can't double-assign
- [X] Every mutation (`ProjectSkillAssigned`, `ProjectSkillUnassigned`) produces a corresponding audit event

## Open Questions

- None currently.

## Dependencies

- `001-project-model-and-membership.md` (owner/collaborator team list)
- `003-prompt-sharing.md` (a skill must already be in a team's catalog — owned or subscribed/forked in — before it's assignable)

## Technical Notes

This feature is what `backlog/011-vcs-integration/003-required-skill-governance-policy.md` and `005-pr-evaluation-and-github-check-runs.md` now depend on instead of Governance — see those files' updated Technical Notes. Do not route this through Governance's resolution engine; per PDR-016, "required for this project" is orthogonal to any invoking user's team-chain inheritance.
