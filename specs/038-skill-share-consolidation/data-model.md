# Phase 1 Data Model: Skill share/project-drawer consolidation

No schema migration. Every table this feature reads already exists. This
document describes the existing entities this feature touches (read-only,
except where noted) and the one new derived data shape.

## Existing entities (unchanged)

### `prompt_registry.prompts` (a "skill")

Relevant existing columns for this feature:

- `id`, `organization_id`, `name`
- `forked_from_skill_id` (nullable FK to another `prompts.id`) — already
  set by `forkSkill`. This feature adds its first *read* consumer beyond
  fork-creation itself: `countForksOfSkill` counts rows where this column
  points at a given skill.

No column added, removed, or altered.

### `prompt_registry.subscriptions`

Relevant existing columns:

- `id`, `organization_id`, `source_skill_id`, `subscriber_type` (`"user" |
  "team" | "project"`), `subscriber_id`

Already fully read by the existing `listSubscriptionsForSkill(db, orgId,
sourceSkillId)` — this feature adds no new query against this table, only
a new *consumer* of the already-fetched result (`.length` as the
"subscribers" count, counting every row regardless of `subscriber_type`).

No column added, removed, or altered.

### `prompt_registry.project_skill_assignments` (implicit — via
`listProjectSkillAssignmentsForOrganization` / `assignSkillToProject`)

Relevant existing shape: `projectId`, `skillId`, `requirement` (`"required"
| "optional"`).

Fully unchanged by this feature — still read/written exactly as today, only
through the project detail page. The skill detail page stops reading this
data as an *editable* set (`projectAssignment` field removed from
`PromptDetailData`), but continues reading it read-only for the existing
`projectLabels` badge (unchanged query, unchanged display).

## New derived data (no new storage)

### `PromptDetailData` shape changes (`prompt-detail-view.tsx`)

**Removed**:

```ts
projectAssignment: Array<{ projectId: string; projectName: string; requirement: "required" | "optional" | null }>;
```

**Added** (replacing the current `teamCount`/`projectCount`-shaped banner
inputs with the three-metric shape the approved design specifies):

```ts
shareSummary: {
  teamCount: number;   // unchanged computation: shareState.teams.filter(t => t.granted).length
  subscriberCount: number; // NEW: total subscription rows for this skill, all subscriber types combined
  copyCount: number;   // NEW: count of org-wide skills with forkedFromSkillId === this skill's id
};
```

**Unchanged**: `projectLabels: string[]` (the read-only badge data) stays
exactly as it is today.

## Validation rules

None new. `countForksOfSkill` is a pure count with no input validation
beyond the existing `organizationId`/`skillId` types already enforced
elsewhere on this page (both already-validated UUIDs by the time this
function is called, same as `listSubscriptionsForSkill`'s existing
callers).

## State transitions

None. This feature introduces no new state machine — it only removes an
editing surface (the project-assignment drawer) and adds a read.
