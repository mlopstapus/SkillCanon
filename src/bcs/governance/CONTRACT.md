# Governance — Contract

**Owner:** Ben Anderson
**Status:** Draft

## Purpose

Owns `Policy` and `Objective` and the hierarchical resolution engine that walks a team chain and merges inherited (immutable) and local (mutable) layers by priority. This is one of SkillCanon's two core-domain contexts — the thing that makes prompt expansion governed rather than a plain template render. It exposes resolution as a synchronous read contract; it never reaches into Prompt Registry or Identity's internals, only consumes Identity's `getTeamChain` and (for the project-scoped entrypoint below) Prompt Registry's `getProject`.

## Exposed APIs

| Endpoint / Method | Description | Consumers |
|---|---|---|
| `resolveEffectivePolicies(orgId, userId, projectId?)` | Returns `{ inherited: Policy[], local: Policy[] }`, inherited from ancestor teams (immutable), local from the user's own team + optional project | Prompt Registry, Distribution (`sh-context` tool) |
| `resolveEffectiveObjectives(orgId, userId, projectId?)` | Same shape, for objectives | Prompt Registry, Distribution |
| `resolveAllPolicies(orgId, userId, projectId?)` | Single merged list, priority desc, inherited wins ties | Prompt Registry (expansion) |
| `resolveRequiredSkillPolicies(orgId, projectId)` | **New (011-vcs-integration).** Same team-chain resolution as `resolveEffectivePolicies`, but starts from the project's *owning team* (via Prompt Registry's `getProject`) rather than a specific user's team — there is no acting user in a webhook-triggered PR evaluation. Returns only `enforcementType: "require-skill"` policies, inherited + local merged, as a flat list of required skill names. | VCS Integration |
| `createPolicy`, `updatePolicy`, `deletePolicy`, `createObjective`, `updateObjective` | Standard write operations, org-scoped | Distribution (route handlers) |

## Events Published

| Event | Payload summary | Consumers |
|---|---|---|
| `PolicyCreated` / `PolicyUpdated` / `PolicyDeactivated` | orgId, policyId, teamId or projectId, actorUserId | Audit |
| `ObjectiveCreated` / `ObjectiveUpdated` | orgId, objectiveId | Audit |

## Events Consumed

| Event | From BC | What this BC does with it |
|---|---|---|
| `TeamReparented` | Identity & Access | None required — resolution reads the team chain fresh on every call, no cached state to invalidate |

## Data Contracts

```ts
type EnforcementType = "prepend" | "append" | "inject" | "validate" | "require-skill";
// "require-skill": `content` holds the required skill/prompt name, one Policy row per required
// skill (not a delimited list) — consistent with every other enforcementType being one rule per row.

interface Policy {
  id: string; orgId: string; teamId: string | null; projectId: string | null;
  name: string; enforcementType: EnforcementType; content: string;
  priority: number; isActive: boolean; isInherited: boolean; // set by the resolver, not stored
}

interface Objective {
  id: string; orgId: string; teamId: string | null; projectId: string | null;
  userId: string | null; title: string; parentObjectiveId: string | null;
  isInherited: boolean;
}
```

## Stability Guarantees

Resolution is **read-your-writes consistent** within the same request — it always reads current state, never a cache, because a stale policy silently applied is a correctness bug, not a performance tradeoff. Priority ordering and inherited-wins-ties tiebreak rules will not change without a major version bump; Prompt Registry's expansion output depends on them.

## Breaking Change Policy

Any change to resolution ordering/tiebreak semantics requires a PDR, since it changes what governance actually gets applied to every existing prompt expansion. This includes `resolveRequiredSkillPolicies` — it reuses the same inherited/local merge and priority rules, not a separate resolution algorithm.
