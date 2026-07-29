# Governance — Contract

**Owner:** Ben Anderson
**Status:** Draft

## Purpose

Owns `Policy` and `Objective` and the hierarchical resolution engine that walks a team chain and merges inherited (immutable) and local (mutable) layers by priority. This is one of SkillCanon's two core-domain contexts — the thing that makes prompt expansion governed rather than a plain template render. It exposes resolution as a synchronous read contract; it never reaches into Prompt Registry or Identity's internals, only consumes Identity's `getTeamChain`.

Policy resolution is **purely team + invoking-user scoped — never project-scoped** ([PDR-016](../../../docs/pdr/016-skill-ownership-sharing-and-project-assignment.md)). Whether a project needs a particular skill is a Prompt Registry catalog fact (`listRequiredSkillsForProject`), not something Governance resolves — a project isn't a governance concern at all. `Objective` keeps its own optional `projectId` scope unchanged; objectives are goal-tracking, not enforcement, and PDR-016 didn't touch them.

## Exposed APIs

| Endpoint / Method | Description | Consumers |
|---|---|---|
| `resolveEffectivePolicies(orgId, userId)` | Returns `{ inherited: Policy[], local: Policy[] }`, inherited from ancestor teams (immutable), local from the user's own team | Prompt Registry, Distribution (`sh-context` tool) |
| `resolveEffectiveObjectives(orgId, userId, projectId?)` | Same shape, for objectives | Prompt Registry, Distribution |
| `resolveAllPolicies(orgId, userId)` | Single merged list, priority desc, inherited wins ties | Prompt Registry (expansion) |
| `createPolicy`, `updatePolicy`, `deletePolicy`, `createObjective`, `updateObjective`, `deleteObjective` | Standard write operations, org-scoped | Distribution (route handlers) |

## Events Published

| Event | Payload summary | Consumers |
|---|---|---|
| `PolicyCreated` / `PolicyUpdated` / `PolicyDeactivated` | orgId, policyId, teamId or projectId, actorUserId | Audit |
| `ObjectiveCreated` / `ObjectiveUpdated` / `ObjectiveDeleted` | orgId, objectiveId, actorUserId | Audit |

## Events Consumed

| Event | From BC | What this BC does with it |
|---|---|---|
| `TeamReparented` | Identity & Access | None required — resolution reads the team chain fresh on every call, no cached state to invalidate |

## Data Contracts

```ts
type EnforcementType = "prepend" | "append" | "inject" | "validate";

interface Policy {
  id: string; orgId: string; teamId: string; // always team-scoped — no projectId (PDR-016)
  name: string; enforcementType: EnforcementType; content: string;
  priority: number; isActive: boolean; isInherited: boolean; // set by the resolver, not stored
}

interface Objective {
  id: string; orgId: string; teamId: string | null; projectId: string | null;
  userId: string | null; title: string; description: string | null;
  parentObjectiveId: string | null; status: string; isInherited: boolean;
}
```

## Stability Guarantees

Resolution is **read-your-writes consistent** within the same request — it always reads current state, never a cache, because a stale policy silently applied is a correctness bug, not a performance tradeoff. Priority ordering and inherited-wins-ties tiebreak rules will not change without a major version bump; Prompt Registry's expansion output depends on them.

## Breaking Change Policy

Any change to resolution ordering/tiebreak semantics requires a PDR, since it changes what governance actually gets applied to every existing prompt expansion.
