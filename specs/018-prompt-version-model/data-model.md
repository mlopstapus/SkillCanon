# Data Model: Prompt & Version Model

## Entities

### Prompt

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `id` | UUID PK | No | `defaultRandom()` via shared `id()` helper |
| `organization_id` | UUID | No | Tenant scope — via shared `organizationId()` |
| `name` | text | No | Unique within org |
| `description` | text | Yes | Human-readable description |
| `is_deprecated` | boolean | No | Default `false` |
| `active_version_id` | UUID FK → `prompt_versions.id` | Yes | Null until first version published |
| `user_id` | UUID | Yes | Optional owner user |
| `created_at` | timestamptz | No | `defaultNow()` |
| `updated_at` | timestamptz | No | `defaultNow()` |

**Uniqueness**: `UNIQUE(organization_id, name)` — org-scoped, not globally unique.

**Indexes**: `INDEX(organization_id, name)` for fast name lookups.

### PromptVersion

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `id` | UUID PK | No | `defaultRandom()` |
| `prompt_id` | UUID FK → `prompts.id` | No | Cascade on delete |
| `version` | text (max 50) | No | Version label, e.g. `"v1"`, `"2024-07-01"` |
| `system_template` | text | Yes | Optional system prompt template |
| `user_template` | text | Yes | Optional user prompt template |
| `input_schema` | jsonb | No | Default `{}` |
| `tags` | jsonb | No | Default `[]` |
| `created_at` | timestamptz | No | `defaultNow()` — immutable record |

**Uniqueness**: `UNIQUE(prompt_id, version)` — version identifier unique per prompt.

**Note**: No `updated_at` column — versions are write-once. No application-layer update function exists.

## Relationships

```
organization ──< prompts >── [active_version_id] ──< prompt_versions
                                                         ^
                                                         |
                                                    (prompt_id FK)
```

- One organization has many prompts (org-scoped)
- One prompt has many versions
- One prompt has at most one "active" version at a time (pointer, not a lock)
- Version rows are never modified after creation

## State Transitions

### Prompt lifecycle

```
[created, no version] → publishVersion → [active, has active_version_id]
                       → publishVersion → [active, active_version_id updated to latest]
                       → rollback       → [active, active_version_id repointed to older version]
                       → deprecate      → [deprecated, is_deprecated=true, versions still accessible]
```

Note: deprecating a prompt does not block version publication (per spec FR-017).

## Drizzle Schema Location

`src/bcs/prompt-registry/infrastructure/schema.ts` — add to the existing file alongside `projects` and `projectMembers`.
