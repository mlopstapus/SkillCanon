# Research: Prompt & Version Model

## Decision: Data model approach

**Decision**: Mirror the existing `project`/`project_members` pattern for `prompts`/`prompt_versions`.

**Rationale**: The project model was already ported with org-scoping, auditing, and immutability semantics. The prompt tables follow the same schema conventions (Drizzle ORM, `promptRegistrySchema`, shared `id()`/`organizationId()`/`timestamps()` helpers). Reusing this pattern minimises risk and cognitive overhead.

**Alternatives considered**: Starting fresh with a new schema pattern — rejected because the existing pattern already satisfies all constitutional requirements.

## Decision: PromptVersion immutability enforcement

**Decision**: Omit an `updatePromptVersion` function entirely from the application layer.

**Rationale**: The spec and constitution both require immutability. The simplest and most reliable way to enforce it is to never write the function, rather than adding a runtime guard. Any future attempt to add an update path will be a deliberate, visible code change.

**Alternatives considered**: Adding a runtime guard or DB trigger — rejected as extra complexity; the absence of a function is simpler and covers all entry points.

## Decision: `active_version_id` reference pattern

**Decision**: Store `active_version_id` as a nullable UUID column on `prompts`. It is updated (only to a different already-published version's ID) by `rollback` and by `publishVersion` (which advances it to the newly created version). The column is nullable because a brand-new prompt has no version yet.

**Rationale**: This matches the legacy Python schema and the spec's rollback requirement (`pin_version`).

## Decision: Audit actions

**Decision**: Use `prompt.created` and `prompt_version.published` as the action strings.

**Rationale**: The `getAuditActionVerb` function extracts the verb after the last `.` — so `prompt.created` → verb `created` (already in `AUDIT_ACTION_VERBS`). `prompt_version.published` → verb `published`. `published` is not currently in `AUDIT_ACTION_VERBS`; it will be added alongside a color entry of `green`.

**Alternatives considered**: Using `PromptCreated`/`PromptVersionPublished` as raw action strings — rejected; the system's action convention is `resource.verb` (e.g. `project.created`).

## Decision: PromptIdentityVerifier contract

**Decision**: Define a `PromptIdentityVerifier` interface with a single `userBelongsToOrganization(orgId, userId): Promise<boolean>` method, analogous to `ProjectIdentityVerifier`.

**Rationale**: The only cross-context check in the prompt domain is validating that an optional owner user belongs to the prompt's organization. Keeping it as an interface means the application layer never imports identity-access internals.

## Decision: `prompt_versions` table unique constraint

**Decision**: Add `UNIQUE(prompt_id, version)` — matching the legacy Python `__table_args__`.

**Rationale**: Within a prompt, version identifiers must be unique. The version field is a text string (e.g. `"v1"`, `"2024-07-01"`) — no forced format.
