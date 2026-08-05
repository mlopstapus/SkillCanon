# Data Model: Governance Views UI

## Policy (existing, `governance.policies`)

- Fields used by this feature: `id`, `teamId` (always non-null), `name`, `enforcementType` (`prepend` | `append` | `inject` | `validate`), `content`, `priority`, `isActive`.
- No schema change. This feature is a new UI consumer of `createPolicy`/`updatePolicy`/`deletePolicy`/`resolveAllPolicies` plus the two new `*ForTeam` resolution functions below.
- Display rule (FR-011): the authoring drawer offers all four `enforcementType` values (per Clarifications), but the Inherited/Local lists must render a row correctly regardless of which of the four values it has — never assume only UI-offered values exist on a real row.

## Objective (existing, `governance.objectives`)

- Fields used by this feature: `id`, `teamId` (nullable), `projectId` (nullable, out of this feature's scope — no project-scoped objective creation UI here), `userId` (nullable), `title` (not `name` — the mockup's placeholder field name doesn't match the real column), `description` used as this feature's "content" field, `status`.
- No schema change. New UI consumer of `createObjective`/`updateObjective`/`deleteObjective`/`resolveAllObjectives`.

## New: `resolveEffectivePoliciesForTeam(db, actor, teamId)`

- Location: `src/bcs/governance/application/resolve-effective-policies-for-team.ts`
- Signature: `(db: Db, actor: PolicyActor, teamId: string) => Promise<EffectivePolicySet>` — same return shape as `resolveEffectivePolicies`.
- Behavior: verify `teamId` belongs to `actor.organizationId` (mirrors `getTeamChain`'s own org-scoping — do not trust a path-supplied `teamId` alone, per Constitution M1-M3), call `getTeamChain(db, actor.organizationId, teamId)` directly (no user lookup), then for each team in the chain call `listActiveByTeam` exactly like `resolveEffectivePolicies` does — index 0 (the team itself) is `local`, the rest is `inherited`, both sorted by `priority` descending.

## New: `resolveEffectiveObjectivesForTeam(db, actor, teamId)`

- Location: `src/bcs/governance/application/resolve-effective-objectives-for-team.ts`
- Signature: `(db: Db, actor: ObjectiveActor, teamId: string) => Promise<EffectiveObjectiveSet>` — same return shape as `resolveEffectiveObjectives`, minus the `projectId`/per-user-objective branches (a bare team scope has no associated user or project in this feature's flow).
- Behavior: same team-chain walk as above using `listActiveByTeam` (objectives repo).

## Scope (UI-only concept, not a stored entity)

- `{ kind: "team"; teamId: string; label: string } | { kind: "person"; userId: string; teamId: string | null; label: string }`
- A team scope calls the two `*ForTeam` functions above. A person scope calls the existing `resolveEffectivePolicies`/`resolveEffectiveObjectives(db, actor, userId)`.
- The scope tree (`scope-tree.tsx`) builds the full list of selectable scopes from `listTeams`/`getTeamChain` (team hierarchy, reusing `teams-explorer.tsx`'s tree-order algorithm) interleaved with each team's members (`listUsers` scoped by `teamId`), each annotated with a local-item count (policies local to that team, or — for a person — 0, since policies can never be person-local per FR-005; objectives local to that team/person).

## Governance API surface change

| Function | Status |
|---|---|
| `resolveEffectivePoliciesForTeam(db, actor, teamId)` | New |
| `resolveEffectiveObjectivesForTeam(db, actor, teamId)` | New |
| `resolveEffectivePolicies`, `resolveEffectiveObjectives`, `resolveAllPolicies`, `resolveAllObjectives`, `createPolicy`, `updatePolicy`, `deletePolicy`, `createObjective`, `updateObjective`, `deleteObjective` | Unchanged, first real UI callers |
