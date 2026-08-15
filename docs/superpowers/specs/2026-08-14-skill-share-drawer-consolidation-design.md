# Skill share/project-drawer consolidation

**Date**: 2026-08-14
**Status**: Approved

## Problem

The skill detail page (`src/app/(app)/prompts/[name]/`) currently exposes two
separate drawers for two overlapping "this skill relates to a project"
concerns:

- **Share** (`share-drawer.tsx`) — grants access (subscribe) to people,
  teams, or projects.
- **Projects** (`assign-projects-drawer.tsx`) — sets a per-project
  requirement level (`required` / `optional` / none) for this skill.

This is confusing: it isn't obvious which drawer to use for "this skill
belongs to project X," and the requirement-setting capability in
`assign-projects-drawer.tsx` fully duplicates a capability that already
exists, correctly, on the project's own detail page (`src/app/(app)/
projects/[id]/project-detail-view.tsx`'s "Skills" tab — Required / Optional
/ Available groups, wired to the same `assignSkillToProjectAction` /
`unassignSkillFromProjectAction`).

A Claude Design mockup (`SkillCanon Skills.dc.html`, project
`7babdbf3-c063-46b5-84df-ffa9f588d88a`) confirms the intended shape: its
Share drawer has no requirement/enforcement control at all — only
People/Teams/Projects grant rows — and its Project detail page's Skills tab
already carries the Required/Optional/Available UI as the sole place
enforcement is set.

## Decision

Consolidate to one mechanism per concern, each living in exactly one place:

1. **Grants** (subscribe access) — only in the skill page's Share drawer.
2. **Enforcement** (required/optional) — only in the project page's Skills
   tab. Nothing on the skill page sets or shows an editable requirement.

## Scope

### Remove from the skill detail page

- `assign-projects-drawer.tsx` and its test file, deleted.
- The "Projects" toolbar button, `assignOpen` state, `onOpenAssignProjects`
  prop/callback, and the `AssignProjectsDrawer` render, all removed from
  `prompt-detail.tsx` and `prompt-detail-view.tsx`.
- The `projectAssignment` field removed from `PromptDetailData` (in
  `prompt-detail-view.tsx`) and from the data loader in `page.tsx`.
- Now-unused imports of `assignSkillToProjectAction` /
  `unassignSkillFromProjectAction` removed from `prompt-detail.tsx` /
  `page.tsx` for this route only. **`project-detail.tsx` keeps its own
  imports and usage of these same actions unchanged** — that's the sole
  remaining call site, and it's correct as-is.

### Explicitly unchanged (do not touch)

- The read-only project-label badge on the skill page (`projectLabels` /
  `data.projectLabels`, the violet chip showing which project(s) a skill is
  required/optional for). This is a display of project-side state, not an
  editing surface — it matches the mockup's own `d.hasProject` /
  `d.projectLabel` chip and stays exactly as it is.
- "Make a copy" (fork) and Deprecate/Reactivate toolbar buttons. The
  mockup's header only shows Share + New version, but that reflects the
  mockup being a simplified prototype of this one screen, not a design
  intent to remove real, working, unrelated functionality. Only the two
  sharing/enforcement mechanisms are in scope for this change.
- Everything on `project-detail.tsx` / `project-detail-view.tsx`'s "Skills"
  tab — it already matches the mockup's Required/Optional/Available design
  and needs no changes.

### Share drawer changes (`share-drawer.tsx`)

- Banner copy updated to match the mockup exactly:

  > Members of a shared team can subscribe to get live updates as new
  > versions publish, or make a copy they own and edit independently. Only
  > you can edit the original.

  (Replaces the current "Members of a shared team or project can
  subscribe... or make a copy..." text, which has no "Only you can edit the
  original" line.)

- Grant/Revoke button labeling **normalized across all three sections**
  (People, Teams, Projects) to "Grant" / "Revoke". The mockup itself has an
  inconsistency — Teams rows say "Share" / "Revoke" instead of "Grant" /
  "Revoke" — which is not carried over; per explicit user direction, this
  gets normalized rather than reproduced.

- The "Shared with…" pill (shown in the header and as the reopen-drawer
  trigger) changes from "X teams · Y projects" to "X teams · Y subscribers ·
  Z copies":
  - **teams** — unchanged: count of granted team rows.
  - **subscribers** — total subscription-row count for this skill across
    all subscriber types (people + teams + projects combined). This is
    `listSubscriptionsForSkill(...).length`, already fetched by `page.tsx`
    today — no new query.
  - **copies** — count of org-wide skills whose `forkedFromSkillId` points
    at this skill. New data: see below.
  - Visibility gate unchanged: shown only when there's at least one team or
    project grant (same condition as today's `totalGrants > 0`).

  Note: the mockup's own `subCount`/`copyCount` are hardcoded, fabricated
  per-team numbers in its mock data (e.g. "engineering: 6 subscribers, 2
  copies") with no real mechanism behind them — our schema has no concept of
  "how many individual members of a team-granted team separately
  subscribed." The definitions above are the closest real equivalent (total
  real subscription rows; total real forks), not a literal port of the
  mockup's fake numbers.

### New backend piece: `countForksOfSkill`

- `src/bcs/prompt-registry/infrastructure/prompts-repo.ts`: new
  `countForksOfSkill(tx, organizationId, sourceSkillId)` —
  `SELECT count(*) FROM prompts WHERE organization_id = $1 AND
  forked_from_skill_id = $2`. Pure count, no auth check — same posture as
  the existing `listSubscriptionsForSkill` (a read that only surfaces a
  number, never skill contents).
- New thin application-layer wrapper (e.g.
  `application/count-forks-of-skill.ts`), exported from the BC barrel
  (`src/bcs/prompt-registry/index.ts`) and documented in `CONTRACT.md`
  alongside the existing `listSubscriptionsForSkill` entry.
- Wired into `src/app/(app)/prompts/[name]/page.tsx`'s existing
  `Promise.all([...])` data-fetch block as one more parallel query in the
  same transaction.

## Testing

- Delete `assign-projects-drawer.test.tsx`.
- Add a Testcontainers-backed test for `countForksOfSkill`, mirroring the
  shape of the existing `list-subscriptions-for-skill.test.ts`.
- Update `prompt-detail-view.test.tsx` / `share-drawer.test.tsx` for: the
  new banner copy, the removed Projects button, and normalized Grant/Revoke
  labels across all three sections.
- Update the skill-detail-page loader test (if one exists) for the new
  `subCount`/`copyCount`-derived fields and the removed `projectAssignment`
  field.
- No changes needed to `project-detail-view.tsx` or its tests — untouched
  by this change.

## Out of scope

- Any change to the project detail page's existing Skills tab (Required /
  Optional / Available) — it already matches the mockup and already fully
  owns enforcement.
- Any change to `assignSkillToProjectAction` / `unassignSkillFromProjectAction`
  themselves, or to the backend eligibility rule that assignment requires
  the skill be owned by a project-participating team — unaffected by this
  UI consolidation.
- Fork/Deprecate/Reactivate toolbar functionality — unchanged, despite the
  mockup's simplified header omitting them.
