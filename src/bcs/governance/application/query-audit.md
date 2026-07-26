# Governance Query Audit

Scope: SKI-36 Governance tenant isolation tests. Audit date: 2026-07-26.

## Result

Zero remaining Governance policy/objective service queries target tenant-scoped rows without filtering by the caller's `organizationId`.

## Policies

| File | Query path | Tenant filter result |
| ---- | ---------- | -------------------- |
| `src/bcs/governance/application/create-policy.ts` | `createPolicy()` derives inserted `organizationId` from `actor.organizationId` after scope verification. | Pass |
| `src/bcs/governance/application/get-policy.ts` | `getPolicy()` delegates to `findByOrgAndId(db, actor.organizationId, policyId)`. | Pass |
| `src/bcs/governance/application/update-policy.ts` | `updatePolicy()` reads and updates through `findByOrgAndId()` / `update()` with `actor.organizationId`. | Pass |
| `src/bcs/governance/application/delete-policy.ts` | `deletePolicy()` reads and deactivates through `findByOrgAndId()` / `deactivate()` with `actor.organizationId`. | Pass |
| `src/bcs/governance/application/list-team-policies.ts` | `listTeamPolicies()` delegates to `listActiveByTeam(db, actor.organizationId, teamId)`. | Pass |
| `src/bcs/governance/application/list-project-policies.ts` | `listProjectPolicies()` delegates to `listActiveByProject(db, actor.organizationId, projectId)`. | Pass |
| `src/bcs/governance/application/resolve-effective-policies.ts` | Uses Identity Access contract calls with `actor.organizationId`, then policy repository list calls with `actor.organizationId`. | Pass |
| `src/bcs/governance/application/count-local-policies-and-objectives.ts` | Counts policies through `countActiveByTeam(db, actor.organizationId, node.id)`. | Pass |
| `src/bcs/governance/infrastructure/policies-repo.ts` | `findByOrgAndId()`, `update()`, `deactivate()`, `listActiveByTeam()`, `listActiveByProject()`, and `countActiveByTeam()` all include `eq(policies.organizationId, organizationId)`. | Pass |

## Objectives

| File | Query path | Tenant filter result |
| ---- | ---------- | -------------------- |
| `src/bcs/governance/application/create-objective.ts` | `createObjective()` derives inserted `organizationId` from `actor.organizationId`; parent validation uses `assertParentObjectiveCanBeUsed(tx, actor.organizationId, ...)`. | Pass |
| `src/bcs/governance/application/get-objective.ts` | `getObjective()` delegates to `findByOrgAndId(db, actor.organizationId, objectiveId)`. | Pass |
| `src/bcs/governance/application/update-objective.ts` | `updateObjective()` reads and updates through `findByOrgAndId()` / `update()` with `actor.organizationId`; parent validation also receives `actor.organizationId`. | Pass |
| `src/bcs/governance/application/delete-objective.ts` | `deleteObjective()` reads and deletes through `findByOrgAndId()` / `hardDelete()` with `actor.organizationId`. | Pass |
| `src/bcs/governance/application/list-team-objectives.ts` | `listTeamObjectives()` delegates to `listActiveByTeam(db, actor.organizationId, teamId)`. | Pass |
| `src/bcs/governance/application/list-project-objectives.ts` | `listProjectObjectives()` delegates to `listActiveByProject(db, actor.organizationId, projectId)`. | Pass |
| `src/bcs/governance/application/list-user-objectives.ts` | `listUserObjectives()` delegates to `listActiveByUser(db, actor.organizationId, userId)`. | Pass |
| `src/bcs/governance/application/resolve-effective-objectives.ts` | Uses Identity Access contract calls with `actor.organizationId`, then objective repository list calls with `actor.organizationId`. | Pass |
| `src/bcs/governance/application/objective-validation.ts` | Parent traversal uses `findByOrgAndId(tx, organizationId, currentId)` for every parent lookup. | Pass |
| `src/bcs/governance/application/count-local-policies-and-objectives.ts` | Counts objectives through `countActiveByTeam()` and `countActiveByUser()` with `actor.organizationId`. | Pass |
| `src/bcs/governance/infrastructure/objectives-repo.ts` | `findByOrgAndId()`, `update()`, `hardDelete()`, `listActiveByTeam()`, `listActiveByProject()`, `listActiveByUser()`, `countActiveByTeam()`, and `countActiveByUser()` all include `eq(objectives.organizationId, organizationId)`. | Pass |
