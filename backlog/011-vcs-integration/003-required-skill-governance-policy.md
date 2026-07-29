---
epic: 011-vcs-integration
feature: 003-required-skill-governance-policy
status: open
dependencies: []
---

# Required-Skill Project Assignment

**Superseded design, same problem.** Originally speced as a new Governance `Policy.enforcementType: "require-skill"` resolved via a project-scoped team-chain walk. [PDR-016](../../docs/pdr/016-skill-ownership-sharing-and-project-assignment.md) rejected that — Governance is purely team + invoking-user scoped and has no notion of "project" at all (its `Policy.projectId` scope was removed entirely). "Required for this project" is instead a plain Prompt Registry catalog fact: `backlog/006-prompt-registry/007-project-skill-assignment.md`'s `assignSkillToProject(..., { requirement: "required" | "optional" })` and `listRequiredSkillsForProject(orgId, projectId)`. This feature file now just tracks the VCS-Integration-side dependency on that Prompt Registry capability landing before PR evaluation (feature 005) can be built.

## Requirements

- [ ] `backlog/006-prompt-registry/007-project-skill-assignment.md` is done — this feature has no work of its own beyond confirming that dependency and wiring VCS Integration's calls to it.
- [ ] `src/bcs/vcs-integration/` calls `listRequiredSkillsForProject(orgId, projectId)` from Prompt Registry's contract — never Governance, and never a direct `prompt_registry.*` table query.

## Acceptance Criteria

- [ ] `listRequiredSkillsForProject` requires no `userId` argument and produces a correct result purely from `orgId`/`projectId` (unchanged expectation from the original design, just a different owning BC).
- [ ] No import of anything from `src/bcs/governance/` appears anywhere in `src/bcs/vcs-integration/` for this purpose.

## Open Questions

- None — the mechanism (a direct Prompt Registry catalog read, not a Governance resolution) was settled in PDR-016.

## Dependencies

- `backlog/006-prompt-registry/001-project-model-and-membership.md` (owner/collaborator team list)
- `backlog/006-prompt-registry/007-project-skill-assignment.md` (this feature's actual dependency — supersedes the original `005-governance/003-hierarchical-resolution-engine.md` dependency)

## Technical Notes

- See `src/bcs/prompt-registry/CONTRACT.md`'s `listRequiredSkillsForProject`/`assignSkillToProject` rows and `src/bcs/vcs-integration/CONTRACT.md`'s updated Events Consumed section — both already updated per PDR-016, this feature (now essentially a dependency-tracking stub) just confirms the wiring once 007 is implemented.
- This file is kept (not deleted) rather than silently removed, per this repo's convention of tracking design pivots explicitly rather than erasing the backlog trail — see PDR-016's "Related changes" list.
