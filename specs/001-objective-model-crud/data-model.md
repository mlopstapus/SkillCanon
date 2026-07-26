# Data Model: Objective Model & CRUD

## Objective

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | UUID | Yes | Primary key, generated client-side for create+audit pairing |
| `organization_id` | UUID | Yes | Caller organization; all service operations filter on it |
| `team_id` | UUID nullable | No | Optional team scope; if set, must belong to `organization_id` |
| `project_id` | UUID nullable | No | Optional project scope; if set, must belong to `organization_id` |
| `user_id` | UUID nullable | No | Optional user scope; if set, must belong to `organization_id` |
| `title` | text | Yes | Editable |
| `description` | text nullable | No | Editable |
| `parent_objective_id` | UUID nullable | No | Optional parent objective in the same organization; may be updated |
| `is_inherited` | boolean | Yes | Defaults false for local Objective rows; stored for legacy response compatibility |
| `status` | text | Yes | Defaults `active`; active lists include only `active` |
| `created_at` | timestamptz | Yes | DB default `now()`; active lists order ascending |

## Validation Rules

- Create must require a non-empty `title`.
- Create may supply none, one, or multiple of `teamId`, `projectId`, and `userId`.
- Create/update must reject each supplied team/project/user scope unless `ObjectiveScopeVerifier` confirms it belongs to the caller organization.
- Create/update must reject a supplied parent objective unless it exists in the caller organization.
- Create/update must reject parent links that would make an objective its own ancestor, including direct self-parenting and indirect descendant-as-parent moves.
- Update may change `title`, `description`, `status`, `teamId`, `projectId`, `userId`, and `parentObjectiveId`; it may not change `organizationId` or `createdAt`.
- Get/update/delete must filter by `organizationId`; cross-org objective ids are treated as not found.
- List operations return objectives with `status = 'active'` for the requested team/project/user scope, ordered by `created_at asc`.
- Rejected mutations must leave objective rows and audit rows unchanged.

## State Transitions

```text
new create -> active objective
active objective --update editable fields--> active or caller-supplied status objective
active objective --deleteObjective--> row removed
non-active objective --listTeamObjectives/listProjectObjectives/listUserObjectives--> excluded
```

## Audit Events

| Operation | Action | Resource |
| --- | --- | --- |
| `createObjective` | `objective.created` | new objective id |
| `updateObjective` | `objective.updated` | objective id |
| `deleteObjective` | `objective.deleted` | objective id |
