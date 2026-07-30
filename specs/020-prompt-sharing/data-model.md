# Data Model: Skill Sharing — Subscribe & Fork

## Entities

### Subscription (new table: `prompt_registry.subscriptions`)

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `id` | UUID PK | No | `defaultRandom()` via shared `id()` helper |
| `organization_id` | UUID | No | Tenant scope — via shared `organizationId()` |
| `source_skill_id` | UUID FK → `prompts.id` | No | The skill being subscribed to. `onDelete: cascade` — a subscription has no meaning once its source is gone |
| `subscriber_type` | text enum (`"user"` \| `"team"`) | No | Which kind of entity is subscribing |
| `subscriber_id` | UUID | No | No FK — polymorphic (points at `identity_access.users.id` or `identity_access.teams.id` depending on `subscriber_type`); same "opaque id, no cross-schema FK" convention already used for `organization_id` everywhere in this repo |
| `created_at` | timestamptz | No | `defaultNow()` |

**Uniqueness**: `UNIQUE(source_skill_id, subscriber_type, subscriber_id)` — the same subscriber cannot subscribe to the same skill twice.

**Indexes**: `INDEX(organization_id, subscriber_type, subscriber_id)` for the accessible-skills query's subscription lookup; `INDEX(source_skill_id)` for "who subscribes to this skill" (audit/admin use).

### Prompt / Skill (existing table, unchanged by this feature)

Already carries `owner_type` (`"user" | "team"`), `owner_id`, and `forked_from_skill_id` — added by PDR-016's migration `0016_prompt_registry_prompts_owner_type.sql`. This feature is the first real consumer of `forked_from_skill_id` (via `forkSkill`) and of `owner_type`/`owner_id` beyond `createPrompt`'s always-user-owned default (via `forkSkill`'s `ownerType: "team"` path).

No schema change. Referenced here for completeness since both new application services (`subscribeSkill`, `forkSkill`) read and write this table.

## Relationships

```
prompts (source) ──< subscriptions >── { a user, or a team }   (subscriber_type discriminates which)
prompts (source) ──[forked_from_skill_id]── prompts (fork)      (self-referencing, one level only —
                                                                   a fork-of-a-fork points at its own
                                                                   immediate source, never transitively
                                                                   further back)
```

- One skill may have many subscribers (users and/or teams), and may itself subscribe to nothing (subscriptions are one-directional: subscriber → source).
- One skill may be forked many times, by many different owners; each fork is an independent `Prompt` row with its own `id`, its own version history, and exactly one `forked_from_skill_id` pointing at its immediate source (`null` for a skill that was created directly, not forked).
- A skill's `owner_type`/`owner_id` never changes in place (PDR-016, `bcs/prompt-registry/CONTRACT.md` Stability Guarantees) — the only way for a *new* owner to gain a version of a skill is a new `Subscription` row or a new forked `Prompt` row.

## State Transitions

### Subscription lifecycle

```
[no subscription] → subscribeSkill   → [active — subscriber always resolves source's current active version]
[active]           → unsubscribeSkill → [no subscription — removed entirely, no "inactive" state]
```

A subscription has exactly two states: present or absent. There is no pause/inactive/expired state (matches spec's Key Entities: "a share is either present... or absent... it has no other state").

### Fork lifecycle

```
forkSkill → [new, fully independent Prompt row, forked_from_skill_id set once, never re-evaluated]
```

A fork has no further lifecycle transitions of its own beyond the existing `Prompt`/`PromptVersion` lifecycle already documented in `specs/018-prompt-version-model/data-model.md` (publish, deprecate, rollback) — once created, it *is* an ordinary skill.

## Query Shapes (new/changed application-layer behavior)

### `listSkillsByOrganization(orgId)` — the *discoverable* set (new)

Every skill in the organization, unfiltered by ownership/subscription. A direct passthrough to the existing `listPromptsByOrg(tx, organizationId)` repo query — no new SQL, no new repo function. Satisfies FR-019/FR-020/SC-007.

### `listPrompts(orgId, userId)` — the *accessible* set (rewritten)

The union of:
1. Skills where `owner_type = 'user' AND owner_id = userId`
2. Skills where `owner_type = 'team' AND owner_id = (the caller's own team_id)` — `null` team_id (an unassigned user, per `019-account-team-settings-ui`) contributes nothing here
3. Skills referenced by a `Subscription` row where `subscriber_type = 'user' AND subscriber_id = userId`, **or** `subscriber_type = 'team' AND subscriber_id = (the caller's own team_id)`

Implemented as one query in `prompts-repo.ts` (a new function, e.g. `listAccessibleByOwnerAndSubscriptions`) joining `prompts` and `subscriptions`, rather than three separate round-trips unioned in application code — keeps the org-scoping and de-duplication (a skill the caller both owns *and* is somehow subscribed to should appear once) in one place. Satisfies FR-008/FR-014/FR-015.

## Drizzle Schema Location

`src/bcs/prompt-registry/infrastructure/schema.ts` — add `subscriptions` to the existing file, alongside `projects`, `projectMembers`, `prompts`, `promptVersions`.
