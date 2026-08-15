# PDR-019: Skill Ownership Transfer

**Status:** Accepted
**Date:** 2026-08-14

## Context

[PDR-016](016-skill-ownership-sharing-and-project-assignment.md) established that a skill's `ownerType` and `ownerId` never change in place. A party that needs a skill under a different owner must instead subscribe to it or fork it into a new row.

That guarantee does not support a true ownership move. A fork receives a new skill `id`, so subscriptions, project assignments, and fork lineage from other skills continue to reference the original row. Deprecating the original after a fork leaves those references attached to an obsolete skill rather than the skill now administered by its new owner.

## Options Considered

### A — Keep fork and subscribe as the only owner-facing operations

Pros: preserves PDR-016's immutability guarantee and needs no new ownership mutation.
Cons: does not solve orphaning; the original skill `id` remains in every existing subscription, project assignment, and lineage reference.

### B — Change `ownerType` and `ownerId` in place

Pros: preserves the skill `id` and every reference to it, including subscriptions, project assignments, and fork lineage. A field update is also smaller and more reversible than deleting a skill.
Cons: reverses PDR-016's ownership-immutability guarantee and requires explicit authorization reasoning for both the current and new owner.

### C — Fork, then delete the original

Pros: makes the fork appear to replace the original skill.
Cons: still loses the original `id`; deleting the original is larger and less reversible than an in-place field update. It is strictly worse than Option B.

## Decision

**Option B.** Add `transferSkillOwnership`, which changes a skill's `ownerType` and `ownerId` in place. An organization admin may transfer any in-organization skill. Every non-admin must be authorized for both the current owner and the destination owner. The operation publishes `skill.owner_transferred` with before-and-after ownership.

Fork and subscribe remain separate operations for another party gaining an independent copy or a live reference. Transfer relocates administration of the canonical skill row.

## Consequences

- **Positive:** subscriptions, project assignments, fork lineage, and audit history continue to resolve through the same skill `id` after a transfer.
- **Negative:** the Prompt Registry `CONTRACT.md`, `OWNERSHIP.md`, and stale characterization guardrail must change together to state the new rule consistently.
- **Risks:** authorization must distinguish an organization admin, or a non-admin authorized for both owners, from a caller who merely has access to the skill or one owner.

## Related changes made in this decision

- `docs/pdr/019-skill-ownership-transfer.md` — records the reversal of PDR-016's in-place ownership immutability guarantee.
- `src/bcs/prompt-registry/CONTRACT.md` / `OWNERSHIP.md` — documents transfer as the one exception to fork/subscribe-only ownership operations.
- `src/bcs/prompt-registry/application/personal-to-team-sharing.test.ts` — removes the obsolete public-API characterization guardrail while retaining fork and subscribe source-preservation coverage.
- `src/bcs/prompt-registry/domain/subscription.ts` — transfer-specific domain errors.
- `src/bcs/prompt-registry/infrastructure/prompts-repo.ts` — in-place ownership fields in the additive prompt update shape.
- `src/bcs/prompt-registry/application/subscription-test-helpers.ts` — anticipated ownership-transfer fixture helper.
- `src/bcs/prompt-registry/application/transfer-skill-ownership.ts` / `transfer-skill-ownership.test.ts` — ownership-transfer application service and focused coverage.
- `src/bcs/prompt-registry/application/transfer-skill-ownership.operational-error.test.ts` — proves operational destination-lookup failures propagate unchanged.
- `src/bcs/identity-access/domain/team.ts`, `index.ts`, and `application/get-team.ts` / `get-team.test.ts` — typed same-organization team lookup failure used to distinguish invalid destinations from operational faults.
- `src/bcs/identity-access/application/get-user.ts` / `get-user.test.ts` — typed scoped user lookup failure with the same distinction.
- `src/app/api/teams/[teamId]/route.ts` — preserves the established `TEAM_NOT_FOUND` REST mapping for the typed team lookup failure.
- `src/app/api/users/[userId]/route.ts` — preserves the established `USER_NOT_FOUND` REST mapping for the typed scoped-user lookup failure.
- `src/bcs/prompt-registry/index.ts` — public bounded-context export.
- `src/app/api/skills/[name]/transfer/route.ts` / `route.test.ts` — ownership-transfer REST endpoint and coverage.
- `src/shared/api/errors.ts` / `errors.test.ts` — REST error mappings and their public-code/status coverage.
- `src/app/(app)/prompts/actions.ts` — server action.
- `src/app/(app)/prompts/[name]/page.tsx`, `transfer-ownership-drawer.tsx`, `transfer-ownership-drawer.test.tsx`, `prompt-detail-view.tsx`, `prompt-detail-view.test.tsx`, and `prompt-detail.tsx` — transfer candidates, permission gate, drawer, detail-page wiring, and focused UI coverage.

If a later task needs an unplanned support or test file, that task must add it to this list.
