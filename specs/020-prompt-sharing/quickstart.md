# Quickstart: Skill Sharing — Subscribe & Fork

This is a validation guide, not implementation — it proves the feature end-to-end once built. Full behavior details live in `data-model.md` and `spec.md`; this only sequences the calls.

## Prerequisites

- `pnpm install`
- A running Postgres (Testcontainers spins one up automatically for the test suite — no manual setup needed for automated validation)
- Migration applied: `prompt_registry.subscriptions` table exists (via `pnpm db:migrate` once this feature's migration is generated)

## Scenario 1 — Subscribe, then see the source's new version automatically

```ts
import { withTenantContext } from "@/shared/db/tenant-context";
import { createPrompt, publishVersion, subscribeSkill, getPrompt } from "@/bcs/prompt-registry";

// User A creates a skill and publishes v1
const skillA = await createPrompt(db, actorA, { organizationId, name: "commit-message" });
await publishVersion(db, actorA, { promptName: "commit-message", organizationId, version: "v1", userTemplate: "..." });

// User B subscribes to it
await subscribeSkill(db, actorB, skillA.id, { subscriberType: "user", subscriberId: actorB.userId });

// A publishes v2
await publishVersion(db, actorA, { promptName: "commit-message", organizationId, version: "v2", userTemplate: "...(updated)..." });

// B's next read of the skill resolves v2 — no separate "pull" action
const resolved = await getPrompt(db, organizationId, "commit-message");
// resolved.activeVersionId === the v2 row's id
```

**Expected outcome**: B never called anything except `subscribeSkill` once — the version B sees always tracks A's current active version.

## Scenario 2 — Fork, then verify independence

```ts
import { forkSkill } from "@/bcs/prompt-registry";

const fork = await forkSkill(db, actorTeamAdmin, skillA.id, {
  ownerType: "team",
  ownerId: teamId,
  actingUserId: actorTeamAdmin.userId,
});

// fork.forkedFromSkillId === skillA.id

// Publishing on the source after the fork has zero effect on the fork, and vice versa
await publishVersion(db, actorA, { promptName: "commit-message", organizationId, version: "v3", userTemplate: "..." });
// fork's own active version is still whatever it was copied with — unaffected
```

**Expected outcome**: the fork is a fully independent `Prompt` row from the moment it's created; `forked_from_skill_id` is a permanent, informational pointer only.

## Scenario 3 — Discoverable vs. accessible

```ts
import { listSkillsByOrganization, listPrompts } from "@/bcs/prompt-registry";

const everything = await listSkillsByOrganization(db, organizationId);
// includes skillA even for a caller with zero relationship to it

const bAccessible = await listPrompts(db, actorB);
// includes skillA (B is subscribed) — but NOT some unrelated skill C that B
// neither owns, nor whose team B belongs to, nor subscribes to
```

**Expected outcome**: `listSkillsByOrganization` never filters by relationship; `listPrompts` always does.

## Running the real test suite

```bash
pnpm vitest run src/bcs/prompt-registry
```

Expect the full existing suite plus this feature's new files (`subscribe-skill.test.ts`, `unsubscribe-skill.test.ts`, `fork-skill.test.ts`, `list-skills-by-organization.test.ts`, rewritten `list-prompts.test.ts`) to pass — Testcontainers-backed, no manual DB setup required.
