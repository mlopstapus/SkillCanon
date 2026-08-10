# Data Model: Project-Scoped Governance UI

No new tables, columns, or migrations. This feature is entirely new UI + one new read function over an existing entity.

## Objective (existing — `governance.objectives`)

Unchanged schema. Relevant existing columns for this feature:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `organization_id` | uuid | tenant scope (RLS) |
| `project_id` | uuid, nullable | already exists; this feature is the first UI to author it |
| `team_id` | uuid, nullable | mutually exclusive with `project_id`/`user_id` in practice (a create call sets exactly one) |
| `user_id` | uuid, nullable | mutually exclusive with `project_id`/`team_id` |
| `title` | text | |
| `description` | text, nullable | shown as "guidance" in the UI copy |
| `status` | text | `"active"` \| others; only `"active"` rows are ever listed by this feature |
| `is_inherited` | boolean | always `false` for a project-scoped objective (project scope has no cascade concept — see spec.md's clarification) |

**Validation rules** (already enforced by existing code, unchanged by this feature):
- `title` non-empty (`assertValidObjectiveTitle`, existing).
- `project_id` must resolve to a real project in the caller's organization (`assertObjectiveScopesBelongToOrganization` + this feature's new `projectBelongsToOrganization` verifier callback).
- Only an org-admin may create/update/delete a project-scoped objective (`assertCanManageObjective`, existing, unchanged).

**State transitions**: none new. `status` transitions (active → archived, if any) are out of scope for this feature — the UI only ever creates active objectives and hard-deletes via `deleteObjective`, matching the team/person-scoped page's own existing behavior.

## Read shape: `ObjectiveRow` (new function's return type)

`listProjectObjectives` returns the same row shape `listActiveByProject` already produces (the existing repo function's `select()` result) — no new type needs to be defined; the application-layer function's return type is inferred directly from the existing infrastructure function, matching the pattern `resolve-effective-objectives-for-team.ts` already uses (`Awaited<ReturnType<typeof listActiveByTeam>>[number]`).

## UI-layer types (new)

`ProjectDetailData` (`project-detail-view.tsx`) gains one new field:

```ts
objectives: Array<{
  id: string;
  title: string;
  description: string | null;
}>;
```

No new standalone type needed beyond this — it's a direct, minimal projection of the `Objective` rows above for display purposes only (no `isInherited`/`teamId`/`userId`/`status` needed in the UI, since every row shown here is guaranteed local-to-this-project and active by construction of the query).
