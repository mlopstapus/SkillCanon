# Data Model: Project Skill Assignment

## Entities

### Collaborator Team (new table: `prompt_registry.project_teams`)

*(Pulled forward from `backlog/006-prompt-registry/001-project-model-and-membership.md` — see spec.md Clarifications.)*

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `id` | UUID PK | No | `defaultRandom()` via shared `id()` helper |
| `project_id` | UUID FK → `projects.id` | No | `onDelete: cascade` — a collaborator-team record has no meaning once its project is gone |
| `team_id` | UUID | No | No FK — opaque id, same "no cross-schema FK" convention already used for every `*_id` referencing `identity_access` from this schema |
| `created_at` | timestamptz | No | `defaultNow()` |

**Uniqueness**: `UNIQUE(project_id, team_id)` — the same team cannot be added as a collaborator on the same project twice (FR-019).

**Indexes**: `INDEX(project_id)` for "list this project's collaborators"; `INDEX(team_id)` for "list every project this team collaborates on" (feeds `listByTeam`'s owner-or-collaborator matching, FR-024).

**Invariant enforced at the application layer, not the database**: a project's own owner team (`projects.team_id`) is never inserted as a `project_teams` row for that same project (FR-020). No `CHECK` constraint references another table's column in Postgres, so this is enforced in `addCollaboratorTeam` before insert, the same way `020-prompt-sharing`'s "cannot subscribe to a skill you already own" invariant is enforced in application code rather than SQL.

### Project Skill Assignment (new table: `prompt_registry.project_skill_assignments`)

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `id` | UUID PK | No | `defaultRandom()` via shared `id()` helper |
| `organization_id` | UUID | No | Tenant scope — via shared `organizationId()`; denormalized (same pattern as `subscriptions.organization_id`) so every query and the future RLS policy (`005-prompt-registry-tenant-isolation-tests`) scope directly, without a join to `projects` |
| `project_id` | UUID FK → `projects.id` | No | `onDelete: cascade` — an assignment has no meaning once its project is gone |
| `skill_id` | UUID FK → `prompts.id` | No | `onDelete: cascade` — matches `subscriptions.source_skill_id`'s precedent (an assignment has no meaning once the assigned skill is gone) |
| `requirement` | text enum (`"required"` \| `"optional"`) | No | |
| `created_at` | timestamptz | No | `defaultNow()` |

**Uniqueness**: `UNIQUE(project_id, skill_id)` — the same skill cannot be assigned to the same project twice (FR-002).

**Indexes**: `INDEX(project_id, requirement)` for `listRequiredSkillsForProject`'s filtered read and for the `listPrompts` project-assigned-skills union; `INDEX(skill_id)` for "which projects require this skill" (audit/admin use, mirrors `subscriptions.source_skill_id`'s index rationale).

### Project (existing table, unchanged by this feature)

Already carries `team_id` (the owner team). This feature's eligibility and access-model checks read it but do not modify it.

### Prompt / Skill (existing table, unchanged by this feature)

Already carries `owner_type`/`owner_id`. This feature reads `owner_type`/`owner_id` to check assignment eligibility (Decision 2, research.md) but never writes to `prompts`.

## Relationships

```
projects (owner team = projects.team_id) ──< project_teams >── { additional teams }   (collaborator only —
                                                                                          owner team is never a row here)

projects ──< project_skill_assignments >── prompts     (many-to-many; requirement discriminates
                                                          required vs optional per pair)

"participating teams" for a project = { projects.team_id } ∪ { project_teams.team_id WHERE project_id = ... }
```

- One project may have any number of collaborator teams (in addition to its one owner team); one team may collaborate on any number of projects, in addition to owning any number of its own.
- One project may assign any number of skills; one skill may be assigned to any number of different projects (across different organizations only if the skill and project happen to be in the same one — cross-org assignment is rejected, FR-005).
- A skill's eligibility for assignment is derived entirely from its `owner_type`/`owner_id` against the project's participating-teams set at the moment of assignment — there is no stored denormalization of "which team contributed this assignment"; if the contributing team's collaborator status is later revoked, the existing assignment row is untouched (spec Edge Cases — out of scope for this feature).

## State Transitions

### Collaborator team lifecycle

```
[not participating] → addCollaboratorTeam    → [participating — team's project list includes this project;
                                                  team's catalog is eligible for assignment to it]
[participating]      → removeCollaboratorTeam → [not participating — removed entirely, no "inactive" state]
```

A collaborator-team record has exactly two states: present or absent, same as `Subscription`'s established two-state pattern (`020-prompt-sharing/data-model.md`).

### Project skill assignment lifecycle

```
[not assigned] → assignSkillToProject(requirement)   → [assigned — appears in listPrompts's projectId-filtered
                                                          result for every project member; appears in
                                                          listRequiredSkillsForProject iff requirement = "required"]
[assigned]      → unassignSkillFromProject            → [not assigned — removed entirely, no "inactive" state]
```

Changing `required` ↔ `optional` in place has no operation — unassign then reassign with the new `requirement` (spec Edge Cases).

## Query Shapes (new/changed application-layer behavior)

### `listProjectTeams(orgId, projectId)` — a project's collaborator teams (new)

Direct read of `project_teams` rows for the project, org-scoped via a join through `projects` (mirrors `getPromptVersion`'s existing "no own `organization_id` column, scope via the owning row's" pattern). Does **not** include the owner team in its result set — callers wanting the full participating-teams set combine this with `getProject(...).teamId` (documented explicitly, since `CONTRACT.md`'s own `ProjectTeam` interface note already says "the owner team is `projects.team_id`, not a row here").

### `listRequiredSkillsForProject(orgId, projectId)` — flat required-skill names (new)

`project_skill_assignments` (`requirement = 'required'`, `organization_id = orgId`, `project_id = projectId`) joined to `prompts`, selecting `prompts.name` only. No team-chain resolution, no caller/actor parameter — satisfies FR-009/FR-010/FR-011.

### `listPrompts(orgId, actor, { projectId? })` — accessible set, extended (rewrite)

Existing behavior (owned + own-team + subscribed) unconditionally. When `projectId` is given **and** the caller is a member of that project (`project_members` lookup), also unions in every skill from `project_skill_assignments` for that project (both `required` and `optional`), deduped by skill id against the base set. Satisfies FR-012/FR-013.

### `projects-repo.listByTeam(orgId, teamId)` — owner-or-collaborator (extended)

`WHERE team_id = :teamId OR id IN (SELECT project_id FROM project_teams WHERE team_id = :teamId)`, org-scoped, name-ordered — unchanged return shape, extended `WHERE`. Satisfies FR-024.

## Drizzle Schema Location

`src/bcs/prompt-registry/infrastructure/schema.ts` — add `projectTeams` and `projectSkillAssignments` to the existing file, alongside `projects`, `projectMembers`, `prompts`, `promptVersions`, `subscriptions`.
