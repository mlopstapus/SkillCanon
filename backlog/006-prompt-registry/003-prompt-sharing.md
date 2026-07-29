---
epic: 006-prompt-registry
feature: 003-prompt-sharing
status: open
dependencies: ["002-prompt-and-version-model.md"]
---

# Skill Sharing — Subscribe & Fork

Supersedes the originally-planned `PromptShare` (a plain per-user access grant) with a single, universal sharing mechanism used regardless of whether the owner or recipient is a user or a team ([PDR-016](../../docs/pdr/016-skill-ownership-sharing-and-project-assignment.md)): **subscribe** (a live reference that always resolves the source's current active version) or **fork** (an independent copy under a new owner, with a lineage pointer back to the source). This is also the *only* path by which a personal skill becomes team-owned — there is no direct "reassign owner" operation.

## Requirements

- [ ] `prompt_registry.subscriptions` table: `id`, `organization_id`, `source_skill_id`, `subscriber_type` (`"user" | "team"`), `subscriber_id`, `created_at`, unique on `(source_skill_id, subscriber_type, subscriber_id)`
- [ ] Invariant: `subscriber_id` must belong to the same `organization_id` as the source skill — no cross-org subscribing
- [ ] `subscribeSkill(orgId, sourceSkillId, { subscriberType, subscriberId, actingUserId })` — `actingUserId` must be the subscribing user, or (for `subscriberType: "team"`) an admin of the subscribing team
- [ ] `unsubscribeSkill(orgId, subscriptionId, actingUserId)` — same authorization rule; removes only that one subscription, no effect on the source skill or any other subscriber
- [ ] `forkSkill(orgId, sourceSkillId, { ownerType, ownerId, actingUserId })` — creates a new `prompt_registry.prompts` row: copies the source's current active version's `system_template`/`user_template`/`input_schema`/`tags` into a fresh initial `PromptVersion` under the new prompt, sets `owner_type`/`owner_id` to the given values, sets `forked_from_skill_id` to the source's id. The fork is a fully independent row from creation — no further sync to the source, ever.
- [ ] `listPrompts`'s "accessible skills" resolution (feature 002/004) includes: skills the caller owns, skills the caller's own team owns, skills the caller (or their team) subscribes to — per `bcs/prompt-registry/CONTRACT.md`'s access model

## Acceptance Criteria

- [ ] Subscribing to a skill owned by a user in a different organization is rejected
- [ ] Forking a skill into a team the acting user isn't an admin of is rejected
- [ ] After the source skill publishes a new version, a subscriber's `expand()` call against that skill name resolves the **new** active version — no manual "pull" step
- [ ] After a fork, publishing a new version on the **source** skill has no effect on the forked copy, and vice versa
- [ ] `(source_skill_id, subscriber_type, subscriber_id)` uniqueness enforced — can't double-subscribe
- [ ] Unsubscribing removes the skill from that subscriber's accessible list; it has no effect on other subscribers or the source
- [ ] Every mutation (`SkillSubscribed`, `SkillUnsubscribed`, `SkillForked`) produces a corresponding audit event

## Open Questions

- None currently.

## Dependencies

- `002-prompt-and-version-model.md`

## Technical Notes

This is the access-control input to the "not found or not accessible to you" check on prompt expansion — used by epic 008's REST expand route (and, in turn, its skill-sync CLI feature) today, and by the MCP feature's `sh-run` if that's built later. Keep the accessible-skills query here as the single source of truth Distribution calls into, rather than each caller re-deriving access logic itself. `007-project-skill-assignment.md` builds on this feature — a project can only assign a skill already present in one of its participating teams' catalogs (owned outright or subscribed/forked in).
