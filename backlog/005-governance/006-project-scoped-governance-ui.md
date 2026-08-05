---
epic: 005-governance
feature: 006-project-scoped-governance-ui
status: open
dependencies: ["005-governance-views-ui.md"]
---

# Project-Scoped Governance UI

`005-governance-views-ui.md` (archived 2026-08-05) deliberately scoped its scope-tree/effective-governance page to team and person scopes only (see its spec's Assumptions section) — but the domain model has always supported a third scope: `objectives.projectId` (an objective can be owned by a team, a project, or an individual person; `resolveEffectiveObjectives` already accepts an optional `projectId` argument per `bcs/governance/CONTRACT.md`). No UI anywhere in the app today lets an admin view or author a project-scoped objective — not on the governance pages (team/person scope tree only), and not on the project detail page (`src/app/(app)/projects/[id]/`, owned by `prompt-registry`, has no governance section).

This was `005-governance-views-ui.md`'s own Open Question #2 (carried over from the original backlog item, before the spec narrowed scope): "Confirm whether project-scoped policy/objective management is meant to live here ... or on a project detail page owned by `006-prompt-registry` instead." That question was never actually answered — the spec just excluded project scope from its Assumptions rather than resolving where it belongs.

## Requirements

- [ ] Decide ownership: does project-scoped objective viewing/authoring belong on the existing governance pages (`/teams/[teamId]/objectives`, extended with a project-scope option) or on the project detail page (`/projects/[id]`, a new "Governance" section)? Given `objectives.projectId` is governance's own column and `resolveEffectiveObjectives` is governance's own exported function, the former is the more consistent choice with this repo's BC-ownership convention, but confirm before implementing.
- [ ] Build the view: effective objectives (inherited + local) for a selected project, reusing `resolveEffectiveObjectives(db, actor, userId?, projectId?)`'s existing project-scope support
- [ ] Build authoring: create/edit/delete a local objective at project scope, reusing `createObjective`/`updateObjective`/`deleteObjective`'s existing `projectId` parameter support
- [ ] Note: policies remain team-only by schema constraint (`policies.teamId` is `NOT NULL`) — this feature is objectives-only, not a project-scoped policy capability (none exists to build)

## Acceptance Criteria

- [ ] An admin can view every objective effectively applying to a given project (inherited from governance's team hierarchy plus locally-defined project objectives, per however project objectives inherit — confirm this inheritance rule as part of this feature, since `005-governance-views-ui.md` never needed to define it)
- [ ] An admin can create, edit, and delete a local objective scoped to a project

## Open Questions

- Does a project-scoped objective inherit from anything (e.g. the project's owning team), or is it always a leaf with no ancestor chain? `resolveEffectiveObjectives`'s existing implementation should already answer this — read it first rather than re-deciding the semantics here.

## Dependencies

- `005-governance-views-ui.md` (archived — this feature extends what it deliberately left out)

## Technical Notes

Deferred out of `005-governance-views-ui.md` rather than bundled in, since that feature's mockup (`SkillCanon Governance.dc.html`) never depicted a project scope at all — building it would have meant inventing UI with no source-of-truth design to build against. File this separately so a future session (or a design-mockup update) has a concrete backlog item to build from instead of a buried "Open Question" in an archived feature.
