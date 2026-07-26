---
epic: 011-vcs-integration
feature: 003-required-skill-governance-policy
status: open
dependencies: []
---

# Required-Skill Governance Policy

Extend Governance's existing `Policy` model with a new `enforcementType: "require-skill"`, and add the project-scoped resolution entrypoint PR evaluation needs — reusing the hierarchical team-chain resolution engine rather than building a parallel rules system, per the architecture decision.

## Requirements

- [ ] `Policy.enforcementType` union gains `"require-skill"`; for this type, `content` holds the required skill/prompt name — one `Policy` row per required skill, not a delimited list (consistent with every other enforcement type).
- [ ] Prompt Registry's `getProject(orgId, projectId)` is implemented, returning at minimum `{ id, orgId, teamId, name }`.
- [ ] Governance's `resolveRequiredSkillPolicies(orgId, projectId)` is implemented: looks up the project's owning team via `getProject`, walks that team's chain via `getTeamChain`, merges inherited + local `require-skill` policies by the same priority rules `resolveEffectivePolicies` already uses, and returns a flat list of required skill names.
- [ ] Existing `resolveEffectivePolicies`/`resolveAllPolicies`/`resolveEffectiveObjectives` behavior is unchanged — this is a pure addition, not a modification of existing resolution paths.
- [ ] A minimal UI to create/edit `require-skill` policies exists (can reuse whatever Policy CRUD UI Governance's own `005-governance-views-ui.md` already builds, adding this enforcement type as a selectable option).

## Acceptance Criteria

- [ ] Creating a `require-skill` policy at a team level and resolving it for a project owned by a descendant team returns that policy in the inherited list.
- [ ] Creating a `require-skill` policy directly on a project returns it in the local list, and it doesn't leak to a sibling project under the same team.
- [ ] `resolveRequiredSkillPolicies` requires no `userId` argument and produces a correct result purely from `orgId`/`projectId`.
- [ ] Existing Governance tests for `resolveEffectivePolicies`/`resolveAllPolicies` still pass unmodified.

## Open Questions

None — the mechanism (extend existing enforcementType union, reuse resolution engine) was settled during architecture.

## Dependencies

- `backlog/005-governance/003-hierarchical-resolution-engine.md` must be done (this feature extends it, doesn't replace it)
- `backlog/006-prompt-registry/001-project-model-and-membership.md` must be done (`Project`/`getProject`)

## Technical Notes

- See `src/bcs/governance/CONTRACT.md`'s `resolveRequiredSkillPolicies` row and updated `EnforcementType`, and `src/bcs/prompt-registry/CONTRACT.md`'s new `getProject` row and `Project` interface — both already updated during architecture, this feature just implements what's documented there.
- Per Governance's own Breaking Change Policy (`CONTRACT.md`), this addition does **not** require a PDR — it reuses existing ordering/tiebreak rules rather than changing them. Don't invent a separate resolution algorithm for this enforcement type.
