# Research: Skill Sharing — Subscribe & Fork

## Decision: Splitting `listPrompts` into "accessible" vs. "discoverable"

**Decision**: Repurpose the existing `listPrompts(orgId, userId)` into the narrower **accessible** set (owned + own team's + subscribed), and add a new `listSkillsByOrganization(orgId)` for the **discoverable** set (every skill in the org, unfiltered) — a straight passthrough to the existing `listPromptsByOrg` repo query, unchanged.

**Rationale**: `bcs/prompt-registry/CONTRACT.md` already committed `listPrompts`'s signature to the accessible-set description during the PDR-016 design session, before this spec's own clarification session (FR-019/FR-020) established that "discoverable" is a real, separate, broader guarantee this feature must also satisfy. Reusing the existing unfiltered repo query for discoverability costs nothing — it already does exactly the right thing — while `listPrompts` itself needs genuinely new join logic (subscriptions + team ownership) to become the accessible set.

**Alternatives considered**: Keeping `listPrompts` as the org-wide/discoverable query and adding a *new* function for the accessible set — rejected because it would leave the already-committed `CONTRACT.md` signature wrong, and every other bounded-context-facing consumer (Distribution's future `sh-list`) expects `listPrompts` to mean "what this caller can use," matching every other resource-listing convention in this repo (e.g. `listProjectsByTeam` is already scoped, not global).

**Safety check**: `grep -rn "listPrompts("` across `src/` shows no callers outside `list-prompts.test.ts` itself — safe to change its behavior now, before any other feature depends on the old (unfiltered) shape.

## Decision: Team-scoped authorization reuses the existing org-admin-or-team-owner rule

**Decision**: A team-scoped subscribe/fork/unsubscribe (i.e. `subscriberType`/`ownerType: "team"`) is authorized when the acting user is either an org admin, or the specific team's `owner_id` user — the exact same rule `identity-access`'s `inviteUser`/`revokeInvitation`/`removeTeamMember` already use internally (via their own `assertCanManageInvitationsForTeam` helper), not a new "team admin" role. That helper itself is **not** exported from `identity-access`'s barrel, so this feature re-derives the same two-line check locally in `prompt-registry`'s application layer using two functions that *are* exported — `getTeam(db, organizationId, teamId)` (returns a `Team` including `ownerId`) and `getUser`/the caller's own already-resolved `actingUser.role` — rather than reaching into `identity-access`'s internals, per tenet D1.

**Rationale**: This codebase's role model is org-scoped (`role: "admin" | "member"`), with `teams.owner_id` as the one per-team elevated-authority pointer (confirmed in `identity-access/domain/team.ts` and its `get-team.ts` application function, both exported from the barrel). There is no separate "team admin" concept anywhere else in the codebase to draw on, and no exported single-call helper for this exact check — so the two-line comparison (`actingUser.role === "admin" || team.ownerId === actingUser.id`) is duplicated at the call site in `prompt-registry`, the same way this repo already duplicates other small, stable cross-BC rules locally rather than importing an internal helper (e.g. `019-account-team-settings-ui`'s issue-key drawer duplicating `isScopeAllowedForRole` locally per `CLAUDE.md`).

**Alternatives considered**: Exporting `assertCanManageInvitationsForTeam` itself from `identity-access`'s barrel for reuse — rejected for this feature; it's a small enough rule that duplicating it avoids renaming/repurposing a function whose name and docstring are specific to invitation management, and avoids a cross-cutting rename this feature doesn't need to make. A new `team_admins` membership table — rejected as unjustified new complexity; no other feature needs finer-grained team administration than org-admin-or-owner today.

## Decision: Fork copies content, never re-syncs — enforced by construction, not a flag

**Decision**: `forkSkill` reads the source's current active version's content once, at the moment of forking, and writes it into a brand-new `PromptVersion` row under the new `Prompt` row. No column, flag, or background job ever links the two versions after that point — only `prompts.forked_from_skill_id` (a plain informational pointer) persists the relationship.

**Rationale**: Mirrors `018-prompt-version-model`'s own established pattern for enforcing an invariant by omission rather than a runtime guard (there, immutability was enforced by never writing an `updateVersion` function at all). Here, "never re-syncs" is enforced the same way: there is no operation in this feature that reads `forked_from_skill_id` for anything other than display/audit purposes.

**Alternatives considered**: A "linked" fork that can optionally re-sync later — explicitly rejected by the spec itself (FR-010: "MUST NOT propagate any later change on either side to the other, in either direction, ever again").

## Decision: New audit verbs `subscribed` / `unsubscribed` / `forked`

**Decision**: Add three new verbs to `AUDIT_ACTION_VERBS` (and matching entries in `AUDIT_ACTION_VERB_COLORS`): `subscribed` (violet — matches the existing `shared`/`reparented`/`synced` "relationship" semantic bucket), `unsubscribed` (red — matches `revoked`/`deleted`, an access-removal bucket), `forked` (green — matches `created`/`published`, since a fork is fundamentally a new skill coming into existence). Action strings: `skill.subscribed`, `skill.unsubscribed`, `skill.forked`.

**Rationale**: Follows `018-prompt-version-model`'s own precedent exactly — that feature needed `published` and simply added it alongside a color, rather than shoehorning a new event into an existing, semantically-mismatched verb. `getAuditActionVerb` extracts the verb after the action string's last `.`, so `resource.verb` naming stays consistent with every other action in the system (`project.created`, `prompt_version.published`, etc.).

**Alternatives considered**: Reusing the existing `shared` verb for subscribe (action `skill.shared`) — rejected because `SkillSubscribed` is the spec's own event name (FR-016) and the 1:1 correspondence between event name and audit verb is what every other feature in this BC already does; bending the action string to fit a pre-existing verb would be the shoehorning `018` deliberately avoided.

## Decision: `Subscription` uniqueness and identity

**Decision**: `prompt_registry.subscriptions` table: `id`, `organization_id`, `source_skill_id` (FK → `prompts.id`), `subscriber_type` (`"user" | "team"`), `subscriber_id` (uuid, no FK — polymorphic, same "opaque id, no cross-schema FK" convention this repo already uses for `organization_id` everywhere per `CLAUDE.md`), `created_at`. Unique on `(source_skill_id, subscriber_type, subscriber_id)`.

**Rationale**: Matches the shape already committed in `bcs/prompt-registry/CONTRACT.md`'s `Subscription` interface and `backlog/006-prompt-registry/003-prompt-sharing.md`'s requirements — this research step just confirms the concrete Drizzle column types and that `subscriber_id` correctly has no literal foreign key (since it may point at either `identity_access.users.id` or `identity_access.teams.id` depending on `subscriber_type`, and this repo's established convention is to never put a hard FK on a cross-schema/polymorphic reference).

**Alternatives considered**: Two separate tables (`user_subscriptions` / `team_subscriptions`) instead of a polymorphic `subscriber_type` column — rejected as needless duplication; every query and invariant (uniqueness, org-scoping) is identical between the two cases, differing only in which table `subscriber_id` conceptually points at.
