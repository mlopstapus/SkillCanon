# Data Model: Policy Model & CRUD

## Policy

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | UUID | Yes | Primary key, generated client-side for create+audit pairing |
| `organization_id` | UUID | Yes | Caller organization; all service operations filter on it |
| `team_id` | UUID nullable | Conditional | Exactly one of `team_id`/`project_id` is set |
| `project_id` | UUID nullable | Conditional | Exactly one of `team_id`/`project_id` is set |
| `name` | text | Yes | Editable |
| `description` | text nullable | No | Editable |
| `enforcement_type` | enum text | Yes | `prepend`, `append`, `inject`, `validate` |
| `content` | text | Yes | Editable policy body/skill name |
| `priority` | integer | Yes | Defaults to 0; list ordering is descending |
| `is_active` | boolean | Yes | Defaults true; `deletePolicy` sets false |
| `created_at` | timestamptz | Yes | DB default `now()` |

## Validation Rules

- Create must reject payloads with both `teamId` and `projectId`.
- Create must reject payloads with neither `teamId` nor `projectId`.
- Create must reject a supplied team/project scope unless the `PolicyScopeVerifier` confirms it belongs to the caller organization.
- Update may only change `name`, `description`, `enforcementType`, `content`, and `priority`.
- Get/update/delete must filter by `organizationId`; cross-org policy ids are treated as not found.
- List operations return active policies only, ordered by `priority desc`.

## State Transitions

```text
new create -> active policy
active policy --update editable fields--> active policy
active policy --deletePolicy--> inactive policy
inactive policy --listTeamPolicies/listProjectPolicies--> excluded
```

## Audit Events

| Operation | Action | Resource |
| --- | --- | --- |
| `createPolicy` | `policy.created` | new policy id |
| `updatePolicy` | `policy.updated` | policy id |
| `deletePolicy` | `policy.deactivated` | policy id |
