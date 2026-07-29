# PDR-016: Skill Ownership, Sharing, and Project Assignment

**Status:** Accepted
**Date:** 2026-07-29

## Context

`006-prompt-registry` was still `status: not-started` when this was decided, but its existing scaffolding (`prompts.user_id` as a single nullable owner, a planned `prompt_shares` table granting one user access to another's prompt, `projects.team_id` as a single owning team) had never actually answered three questions the product needs before real governance/VCS-integration work can build on top of it:

1. **Who owns a skill** — an individual, a team, or does ownership follow whatever project it lives in?
2. **How does a skill move between owners** — is sharing a plain access grant, or something richer?
3. **How does a project decide which skills apply to it**, and is that a Governance concern (as `011-vcs-integration`'s already-designed `resolveRequiredSkillPolicies` assumed) or something else?

Answering these also exposed that `011-vcs-integration/003-required-skill-governance-policy.md` and Governance's own `resolveRequiredSkillPolicies` API — both already speced — rest on a project being a governance-scoping unit, which turned out to be the wrong call once ownership was worked through properly.

## Options Considered

### A — Ownership derived from Project (skill lives inside exactly one project, inherits that project's owning team)
Pros: no new ownership field; reuses the existing `projects.team_id`.
Cons: doesn't survive "multiple teams work on one project" — there'd be no way to say *which* of a project's teams actually owns a given skill. Also makes a skill unusable outside the one project it happened to be created in, which doesn't match how a team wants to reuse its own skills across every project it touches.

### B — Independent ownership (a skill is owned by a user or a team, directly; project involvement is a separate, many-to-many concern)
A skill's owner is either a user (`personal`) or a team (`team`), full stop — never derived from a project. Projects assign skills they want to use from the catalogs of the teams actually working on them.
Pros: matches "multiple teams on one project" cleanly; a team's skill catalog is reusable across every project that team touches; ownership and project usage become genuinely orthogonal, which is what let the access model (below) resolve cleanly.
Cons: needs a new ownership discriminator (`owner_type` + `owner_id`) and a new project↔skill assignment table that doesn't exist today.

### C — Governance-mediated required skills (keep `resolveRequiredSkillPolicies`, Policy.projectId, and `enforcementType: "require-skill"` as already speced in `011-vcs-integration`)
Pros: zero rework — this is what was already built into the contracts.
Cons: ties "what skills does this project need" to Governance's team-chain resolution, which conflates two unrelated things: governance is about what content gets injected into a prompt for whoever's invoking it (team + user scoped), while "required for this project" is a plain catalog fact about a project, unrelated to any particular invoking user's inheritance chain. Once ownership stopped being project-derived (Option B), there was no principled way to decide *which* team's chain a multi-team project's required-skill resolution should even walk.

## Decision

**Option B.** A skill (the existing `Prompt` aggregate) is owned by exactly one user or exactly one team (`ownerType: "user" | "team"`, `ownerId`) — never derived from a project. Sharing between any two owners (user→user, user→team, team→team) uses one universal mechanism: **subscribe** (a live reference that follows the source's new versions) or **fork** (an independent copy under a new owner, retaining a `forkedFromSkillId` lineage pointer back to the source for audit/traceability). A project has exactly one **owner team** (admin rights: rename, add/remove collaborator teams, delete) plus any number of **collaborator teams** (many-to-many). A project may only assign skills already present in one of its participating teams' catalogs — never a raw personal skill directly — and each assignment is marked `required` or `optional`; this assignment record, owned by Prompt Registry, is what `vcs-integration`'s PR check reads directly.

This also **removes** `enforcementType: "require-skill"`, `resolveRequiredSkillPolicies`, and `Policy.projectId` from Governance entirely. Governance resolution stays purely team + invoking-user scoped — it never has, and now explicitly never will, care about which project someone happens to be working in. `Objective.projectId` is untouched by this decision; objectives are goal-tracking, not enforcement, and weren't part of what motivated this change.

**Access model** (why Option B's "orthogonal ownership" avoids a reachability gap): team membership grants access to that team's whole catalog; project membership grants access to everything the project has assigned, regardless of which participating team contributed it. Because a project can only assign skills its own participating teams already have, and every project member is automatically inside that access boundary, there is no scenario where a required skill exists but is unreachable by someone actually working on the project.

## Consequences

- **Positive:** ownership, sharing, and project usage are three independently reasoned-about concerns instead of one conflated model; a team's skill catalog is reusable across every project it touches; the access model has no gaps to special-case; Governance's contract gets *simpler* (one fewer enforcement type, one fewer API, one fewer scope dimension on `Policy`) rather than more complex.
- **Negative:** `011-vcs-integration/003-required-skill-governance-policy.md` and its dependents need rewriting before implementation starts (they were speced against the now-rejected Option C) — caught before any code existed, but still real backlog churn. `Prompt Registry` picks up a genuinely new capability (project-skill assignment) that Governance was originally going to own instead.
- **Risks:** the `require-skill`/`resolveRequiredSkillPolicies` shapes were already documented in `bcs/governance/CONTRACT.md` and referenced by `bcs/vcs-integration/CONTRACT.md` — every reference across both contracts and their backlog items must be updated in the same change or the two contracts will describe two different mechanisms for the same problem. Tracked as part of this PDR's own follow-through, not deferred.

## Related changes made in this decision

- `src/bcs/prompt-registry/CONTRACT.md` / `OWNERSHIP.md` — new skill ownership, `Subscription`/fork model (replacing the planned `PromptShare`), `ProjectTeam`, and `ProjectSkillAssignment`.
- `src/bcs/governance/CONTRACT.md` / `OWNERSHIP.md` — removed `require-skill`, `resolveRequiredSkillPolicies`, `Policy.projectId`.
- `src/bcs/vcs-integration/CONTRACT.md` — required-skill source switched from Governance to Prompt Registry's `listRequiredSkillsForProject`.
- `backlog/006-prompt-registry/001-project-model-and-membership.md`, `002-prompt-and-version-model.md`, `003-prompt-sharing.md`, new `007-project-skill-assignment.md`.
- `backlog/011-vcs-integration/003-required-skill-governance-policy.md`, `005-pr-evaluation-and-github-check-runs.md`.
- `backlog/005-governance/001-policy-model-and-crud.md`.
