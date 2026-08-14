# Phase 0 Research: Skill share/project-drawer consolidation

No `[NEEDS CLARIFICATION]` markers exist in the spec — every decision below
was already resolved during the prior design/brainstorming session
(`docs/superpowers/specs/2026-08-14-skill-share-drawer-consolidation-design.md`)
and confirmed against the actual current codebase. This document records
those decisions in the Decision/Rationale/Alternatives format for
traceability, rather than performing fresh research.

## Decision 1: Delete `assign-projects-drawer.tsx` rather than hide/deprecate it

**Decision**: Remove the component, its test file, and every reference to
it (toolbar button, `assignOpen` state, `onOpenAssignProjects` prop,
`projectAssignment` data field) entirely.

**Rationale**: The capability it exposes (`assignSkillToProjectAction` /
`unassignSkillFromProjectAction`) already exists, fully working, on the
project detail page's Skills tab (`src/app/(app)/projects/[id]/
project-detail-view.tsx`). Keeping the skill-page drawer around but hidden
(e.g. behind a flag) would preserve dead code with no forward use — this
repo's conventions favor deleting code confirmed unused over leaving unused
scaffolding (`CLAUDE.md`'s "if you are certain that something is unused,
you can delete it completely").

**Alternatives considered**:
- *Keep both, cross-link them*: rejected — doesn't solve the actual
  reported problem (two ways to do the same thing).
- *Keep the drawer but make it read-only on the skill page*: rejected — a
  read-only duplicate of information already shown via the project-label
  badge (`projectLabels`) adds no value and keeps a second surface to keep
  in sync.

## Decision 2: `countForksOfSkill` as a new, minimal repo-layer read

**Decision**: Add `countForksOfSkill(tx, organizationId, sourceSkillId)` to
`src/bcs/prompt-registry/infrastructure/prompts-repo.ts` — a `SELECT
count(*)` scoped by `organization_id` and `forked_from_skill_id`, wrapped in
a thin application-layer function and exported from the BC barrel.

**Rationale**: `prompts.forked_from_skill_id` already exists (used today by
`forkSkill`) — no schema change needed, just a new read. This mirrors the
existing `listSubscriptionsForSkill` function exactly: same file, same
"pure, unauthenticated read — a count, never skill contents" posture, same
lack of an audit-log requirement (Principle VI only requires auditing
mutations and cross-tenant-sensitive reads; an org-scoped count of one's
own skills' forks is neither).

**Alternatives considered**:
- *Reuse `listPrompts` (already fetched as `accessibleSkills` on this
  page) and filter client-side*: rejected — `listPrompts` returns only the
  *accessible* set for the viewing user (owned/subscribed/team-visible
  skills), not every skill in the org. A fork owned by a team or user the
  viewer has no access to would be silently undercounted. The summary
  needs an org-wide count, which requires its own unauthenticated read
  (same pattern `listSubscriptionsForSkill` already establishes for the
  subscriber side).
- *Store a denormalized fork count on `prompts`*: rejected — no existing
  precedent in this codebase for denormalized counters, and the extra
  write-path complexity (keeping it in sync on every fork/delete) isn't
  justified by a single low-traffic UI display.

## Decision 3: "Subscribers" = total subscription-row count across all types

**Decision**: The summary pill's subscriber count is
`listSubscriptionsForSkill(...).length` — already fetched today by
`page.tsx` for `shareState` — counting every subscription row for the
skill regardless of subscriber type (person, team, or project), each
counted once.

**Rationale**: The mockup's own `subCount`/`copyCount` are hardcoded,
fabricated per-team numbers in its mock data with no real mechanism behind
them (confirmed during design review — our schema has no concept of
"how many individual members of a team-granted team separately
subscribed"). A real total-row-count is the closest faithful equivalent
and requires zero new queries, since the data is already on the page.

**Alternatives considered**:
- *Count only person-type subscriptions*: rejected — doesn't match the
  mockup's intent of a single aggregate "how widely shared is this"
  number, and would make "3 subscribers" misleadingly exclude two entire
  team grants that each extend access to many people.
- *Attempt to model per-team "how many members of this team actually use
  it" as in the mockup*: rejected as infeasible — no such data exists or
  is planned; team-level access is binary (granted or not), not
  per-member-tracked.

## Decision 4: Normalize Grant/Revoke labels across all three sections

**Decision**: People, Teams, and Projects rows in the Share drawer all use
"Grant"/"Revoke" — the mockup's inconsistency (Teams uses "Share"/"Revoke")
is not carried over.

**Rationale**: Explicit user direction during design review ("It's ok to
normalize the difference in people/projects"). Consistent labeling across
three visually-identical row types is a straightforward accessibility/
clarity win with no downside, and matches this repo's existing (pre-change)
behavior for two of the three sections already.

**Alternatives considered**:
- *Preserve the mockup's exact wording, including the Teams
  inconsistency*: rejected per explicit user direction — an intentional
  deviation from "stick to the mockup as closely as possible," documented
  here as such rather than silently changed.

## Decision 5: Fork/Deprecate/Reactivate toolbar buttons stay untouched

**Decision**: The mockup's simplified header (only Share + New Version) is
not reproduced literally — "Make a copy" (fork) and Deprecate/Reactivate
remain on the skill detail page toolbar.

**Rationale**: The mockup is a prototype of one screen's sharing-related
interaction, not a full-fidelity spec of every toolbar action. Removing
real, working, unrelated functionality because a mockup's simplified
header omits it would be a regression, not a consolidation — confirmed
with the user during design review (Section 1, "lgtm").

**Alternatives considered**: None seriously considered — this was flagged
as an explicit scope boundary during design, not a genuine option.
