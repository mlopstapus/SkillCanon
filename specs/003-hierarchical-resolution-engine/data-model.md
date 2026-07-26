# Data Model: Hierarchical Resolution Engine

## EffectivePolicy

Extends the persisted Governance `Policy` row with a resolver-owned presentation flag.

- `id`: policy UUID
- `organizationId`: caller organization UUID
- `teamId`: team scope UUID or null
- `projectId`: project scope UUID or null
- `name`, `description`, `enforcementType`, `content`, `priority`, `isActive`, `createdAt`: persisted policy fields
- `isInherited`: boolean set by the resolver; true only for ancestor-team policies

Validation and invariants:

- Only active policies are returned.
- Each returned row is scoped by `organizationId`.
- Own-team and project policies are local with `isInherited: false`.
- Ancestor-team policies are inherited with `isInherited: true`.

## EffectivePolicySet

- `inherited`: `EffectivePolicy[]` from ancestor teams, sorted by priority descending
- `local`: `EffectivePolicy[]` from own team plus optional project, sorted by priority descending

## MergedPolicyList

A flat `EffectivePolicy[]` containing inherited plus local policies sorted by:

1. `priority` descending
2. `isInherited` true before false when priority is equal
3. Existing legacy/stable order for otherwise equal items

## EffectiveObjective

Extends the persisted Governance `Objective` row with the resolver-owned inherited flag.

- `id`: objective UUID
- `organizationId`: caller organization UUID
- `teamId`: team scope UUID or null
- `projectId`: project scope UUID or null
- `userId`: user-personal scope UUID or null
- `title`, `description`, `parentObjectiveId`, `status`, `createdAt`: persisted objective fields
- `isInherited`: true only for ancestor-team objectives

Validation and invariants:

- Only `status = "active"` objectives are returned.
- Each returned row is scoped by `organizationId`.
- Own-team, user-personal, and project objectives are local.
- Parent objective links do not imply recursive inclusion.

## EffectiveObjectiveSet

- `inherited`: ancestor-team objectives in team-chain order, each team group ordered by `createdAt` ascending
- `local`: own-team objectives, then user-personal objectives, then optional project objectives; each group ordered by `createdAt` ascending

## FlatObjectiveTitles

A `string[]` containing titles from `EffectiveObjectiveSet.inherited`, then titles from `EffectiveObjectiveSet.local`.

## LocalGovernanceCount

- `policyCount`: active policies directly attached to the requested team or user node
- `objectiveCount`: active objectives directly attached to the requested team or user node
- `total`: `policyCount + objectiveCount`

Team node behavior:

- Count active policies with `teamId = nodeId`.
- Count active objectives with `teamId = nodeId`.
- Exclude inherited ancestors, project-scoped records, inactive policies, and inactive objectives.

User node behavior:

- Count active objectives with `userId = nodeId`.
- Policy count is zero because current policy scope supports team or project only.
- Exclude team, project, inherited, and inactive records.
