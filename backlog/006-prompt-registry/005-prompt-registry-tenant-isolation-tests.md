---
epic: 006-prompt-registry
feature: 005-prompt-registry-tenant-isolation-tests
status: open
dependencies: ["001-project-model-and-membership.md", "002-prompt-and-version-model.md", "003-prompt-sharing.md", "007-project-skill-assignment.md", "backlog/002-identity-access/007-tenant-isolation-tests-and-rls.md"]
---

# Prompt Registry Tenant Isolation Tests

Apply RLS and the shared cross-tenant-denial test helper to `prompt_registry.projects`, `prompt_registry.project_teams`, `prompt_registry.prompts`, `prompt_registry.prompt_versions`, `prompt_registry.subscriptions`, and `prompt_registry.project_skill_assignments`, per tenets M1/M2/M3. **Updated 2026-07-29**: the table list reflects [PDR-016](../../docs/pdr/016-skill-ownership-sharing-and-project-assignment.md)'s redesign — the originally-planned `prompt_shares` table was replaced by `subscriptions` (per `003-prompt-sharing.md`), and `project_teams`/`project_skill_assignments` were added (per `001` and `007`).

## Requirements

- [ ] RLS policies enabled on all six tables in this schema
- [ ] Every query in this epic's other features filters by `organization_id`, audited against this feature
- [ ] M3 negative test per resource type: a user in org A cannot read or write org B's project, collaborator-team link, prompt, version, subscription, or project-skill assignment by ID

## Acceptance Criteria

- [ ] Cross-org access by ID is denied for each resource type, proven by test
- [ ] RLS independently blocks cross-org access with the app-layer filter simulated as absent

## Open Questions

- None.

## Dependencies

- `001-project-model-and-membership.md`
- `002-prompt-and-version-model.md`
- `003-prompt-sharing.md`
- `007-project-skill-assignment.md`
- `backlog/002-identity-access/007-tenant-isolation-tests-and-rls.md`

## Technical Notes

Reuses the shared test helper from epic 002. Prompt sharing (feature 003) and project-skill assignment (feature 007) are both intra-org by design — this feature's tests confirm cross-*org* access is denied, not that sharing or assignment themselves are restrictive within an org.
