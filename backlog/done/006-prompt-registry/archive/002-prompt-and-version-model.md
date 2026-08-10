---
epic: 006-prompt-registry
feature: 002-prompt-and-version-model
status: done
dependencies: ["backlog/002-identity-access/EPIC.md"]
---

# Prompt & Version Model

Port `Prompt` (a "skill") and `PromptVersion` from the current Python `models.py`/`prompt_service.py`, correcting `name` uniqueness from global to org-scoped (the same class of multi-tenancy bug fixed for users in epic 002) — and replace the old single-nullable-`user_id` ownership field with a real owner discriminator: a skill is owned by exactly one user or exactly one team, never derived from a project ([PDR-016](../../docs/pdr/016-skill-ownership-sharing-and-project-assignment.md)).

Delivered by `specs/018-prompt-version-model/` (PR #40), with the `owner_type`/`owner_id`/`forked_from_skill_id` ownership shape added as PDR-016 follow-through rather than fresh work under this backlog item (see Technical Notes). This item's own checkboxes went unchecked and `status` stayed `open` after both landed — corrected 2026-07-30 after being caught auditing the epic against actual `src/bcs/prompt-registry` code, not this tracking file.

## Requirements

- [X] `prompt_registry.prompts` table: `id`, `organization_id`, `name`, `description`, `is_deprecated`, `active_version_id` (nullable), `owner_type` (`"user" | "team"`), `owner_id`, `forked_from_skill_id` (nullable, self-referencing FK — lineage pointer, set only when created via fork), timestamps
- [X] `(organization_id, name)` unique — **not globally unique**, correcting the current schema
- [X] Invariant: `owner_id` must belong to the prompt's `organization_id` — a user (if `owner_type: "user"`) or a team (if `owner_type: "team"`)
- [X] `createPrompt`'s owner is always the creating user (`owner_type: "user"`) — there is no direct "create as team-owned" path; a skill becomes team-owned only via `forkSkill` with `ownerType: "team"` (see `003-prompt-sharing.md`)
- [X] `prompt_registry.prompt_versions` table: `id`, `prompt_id`, `version`, `system_template` (nullable), `user_template` (nullable), `input_schema` (jsonb), `tags` (jsonb), `created_at` — **immutable once created**, no update path in the application service, only insert
- [X] CRUD: create prompt, publish new version, deprecate prompt, list/get by name (org-scoped), list versions
- [X] Rollback: repoint `active_version_id` to a previously published version (matches current `pin_version`/`POST /prompts/{name}/rollback/{version}`) — this only changes which version is "active," it never edits an existing `PromptVersion` row's content, so it doesn't conflict with version immutability above

## Acceptance Criteria

- [X] Two different organizations can each have a prompt named `commit` with no conflict
- [X] Within one organization, a second prompt with the same name is rejected
- [X] Creating a prompt with an `owner_id` from a different organization (either owner type) is rejected
- [X] No application code path can update an existing `PromptVersion` row — only create new ones (enforced by omitting an update function entirely, not just by convention)
- [X] Rolling back to an older version updates `active_version_id` only; the rolled-back-to version's own row is untouched, and rolling back does not delete or alter any newer version
- [X] Every mutation produces a corresponding audit event (`PromptCreated`, `PromptVersionPublished`) — rollback is a deliberate exception (see `specs/018-prompt-version-model/spec.md` Assumptions): it changes which version is active but is not a version publication, so it emits no audit event under the current contract

## Open Questions

- None currently.

## Dependencies

- `backlog/002-identity-access/EPIC.md`

## Technical Notes

Per `bcs/prompt-registry/CONTRACT.md`'s stability guarantees, `PromptVersion` immutability is load-bearing for the expansion engine (feature 004) — expansion results must be reproducible against a specific version forever, which breaks if versions can be edited in place. `owner_type`/`owner_id` never change in place on an existing row — see `003-prompt-sharing.md` for how a skill moves to a new owner (fork, not reassignment).

**2026-07-29 (PDR-016)**: this feature's core CRUD/versioning was already implemented (with the original single-nullable-`user_id` ownership) before PDR-016. The `owner_type`/`owner_id`/`forked_from_skill_id` shape described above reflects the *post-refactor* state — `drizzle/migrations/0016_prompt_registry_prompts_owner_type.sql` and the corresponding domain/application changes were done as PDR-016 follow-through, not fresh work under this backlog item. `createPrompt`'s owner is now unconditionally the creating user; the old optional-owner-with-verifier path was removed.
