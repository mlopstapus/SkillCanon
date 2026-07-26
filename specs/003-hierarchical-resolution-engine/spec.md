# Feature Specification: Hierarchical Resolution Engine

**Feature Branch**: `003-hierarchical-resolution-engine`

**Created**: 2026-07-26

**Status**: Clarified

**Input**: User description: "backlog/005-governance/003-hierarchical-resolution-engine.md - Port the current Python policy and objective resolution behavior into Governance's TypeScript bounded context. Preserve the inherited/local two-layer walk, policy priority merge ordering with inherited policies winning ties, objective local/user/project resolution behavior, read-fresh no-cache guarantee, and the local policy/objective count needed by the Governance scope-tree UI."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Resolve effective policies for a user (Priority: P1)

A Governance consumer asks which active policies apply to a user, optionally within a project, and receives the same two groups the legacy system exposes: inherited policies from ancestor teams and local policies from the user's own team plus the optional project.

**Why this priority**: Policy resolution is the core correctness risk for downstream prompt expansion. If the inherited/local split is wrong, governance is silently applied from the wrong scope or with the wrong mutability.

**Independent Test**: Build a multi-level organization/team/user/project fixture, run the current Python `resolve_effective` policy resolver and the new resolver against equivalent data, and assert the inherited and local lists match exactly in membership, priority order, and `isInherited` presentation flags.

**Acceptance Scenarios**:

1. **Given** a user on a child team with active policies on the child team and two ancestor teams, **When** effective policies are resolved without a project, **Then** ancestor-team policies are returned in `inherited`, child-team policies are returned in `local`, and each policy carries the correct inherited flag.
2. **Given** the same user and active policies on a project, **When** effective policies are resolved with that project, **Then** project policies are appended to the local layer and are never marked inherited.
3. **Given** inactive policies at any team or project scope, **When** effective policies are resolved, **Then** inactive policies are excluded from both inherited and local results.
4. **Given** the requested user does not exist in the caller organization, **When** effective policies are resolved, **Then** the result is empty inherited and local lists, matching the legacy behavior or the org-scoped not-found equivalent established by Identity Access.

---

### User Story 2 - Produce the final merged policy order (Priority: P1)

Prompt expansion asks for a single ordered policy list and receives all effective policies sorted by priority descending, with inherited policies before local policies at the same priority.

**Why this priority**: The merged order directly controls what governance text is applied during expansion. The inherited-wins-ties rule is a stability guarantee in the Governance contract and must be proven before any consumer relies on it.

**Independent Test**: Seed inherited and local policies with overlapping priorities, including exact ties, compare current Python `resolve_all_policies` output to the new merged output, and assert identical order.

**Acceptance Scenarios**:

1. **Given** inherited and local policies with different priorities, **When** all policies are resolved, **Then** the merged result is sorted from highest to lowest priority.
2. **Given** an inherited policy and a local policy with the same priority, **When** all policies are resolved, **Then** the inherited policy appears before the local policy.
3. **Given** multiple inherited and local policies with repeated priorities, **When** all policies are resolved, **Then** every tie follows the inherited-before-local rule while preserving the legacy implementation's output for the fixture.

---

### User Story 3 - Resolve effective objectives for a user (Priority: P1)

A Governance consumer asks which active objectives apply to a user, optionally within a project, and receives inherited objectives from ancestor teams plus local objectives from the user's own team, the user's personal objectives, and the optional project.

**Why this priority**: Objective resolution is the parallel contract to policy resolution. Downstream consumers need the same inherited/local shape, but objectives have user-personal scope and legacy ordering differences that must not be lost in the port.

**Independent Test**: Build objective fixtures covering ancestor teams, own team, user-personal scope, project scope, inactive statuses, and parent-objective links. Compare legacy Python effective objective results to the new resolver output exactly.

**Acceptance Scenarios**:

1. **Given** active objectives on a user's own team and ancestor teams, **When** effective objectives are resolved, **Then** ancestor-team objectives appear in `inherited` and own-team objectives appear in `local`.
2. **Given** active objectives assigned directly to the user, **When** effective objectives are resolved, **Then** those user-personal objectives appear in the local layer.
3. **Given** active project objectives and a project id, **When** effective objectives are resolved, **Then** project objectives appear in the local layer.
4. **Given** inactive objectives at any team, user, or project scope, **When** effective objectives are resolved, **Then** inactive objectives are excluded.

---

### User Story 4 - Count local Governance items for scope navigation (Priority: P2)

The Governance views scope tree asks for a local count for a selected team or user node and receives the number of policies and objectives directly attached to that node, not inherited from ancestors.

**Why this priority**: The count is required by the Governance UI mockup but does not affect the resolution engine's core correctness. It can be implemented after the resolver contracts as long as it is named and tested here.

**Independent Test**: Seed local policies and objectives for several teams/users, including inherited ancestor items and inactive/deleted records, then verify the count for each node matches only the active local records directly attached to that node.

**Acceptance Scenarios**:

1. **Given** a team with two active policies and three active objectives directly attached, **When** the local Governance count is requested for that team, **Then** the count is five.
2. **Given** a team whose ancestors have policies and objectives but the team itself has none, **When** the local Governance count is requested, **Then** the count is zero.
3. **Given** a user with personal objectives and no policy records, **When** the local Governance count is requested for that user, **Then** the count includes the user's active objectives and excludes unrelated team/project items.

### Edge Cases

- What happens when `getTeamChain` returns only the user's own team? Inherited results are empty and local results still include own-team plus applicable user/project records.
- What happens when project scope is omitted? Project-scoped policies and objectives are excluded from the local layer.
- What happens when an optional project id belongs outside the caller organization? The resolver must reject or deny it using the same not-found-equivalent convention as the existing org-scoped application layer; it must not leak cross-organization data.
- What happens when two policies have identical priority and the same inherited flag? The resulting order must match the legacy Python output for the characterization fixture; no new semantic tie-break may be invented for this feature.
- What happens when a resolver is called immediately after a policy, objective, or team-parent change? The next read must observe current committed state; no memoized result may be reused within or across requests.
- What happens when objective records have parent/child links? Resolution includes objectives by scope and active status exactly as the legacy resolver does; it does not recursively include descendants merely because a parent objective applies.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST expose `resolveEffectivePolicies(orgId, userId, projectId?)` returning `{ inherited, local }` policy lists for the caller organization.
- **FR-002**: `resolveEffectivePolicies` MUST resolve the user's team chain through Identity Access's org-scoped `getTeamChain(organizationId, teamId)` contract, whose order is self-first and root-last.
- **FR-003**: `resolveEffectivePolicies` MUST classify policies from ancestor teams as inherited and immutable presentation items, with `isInherited` set to true.
- **FR-004**: `resolveEffectivePolicies` MUST classify policies from the user's own team and optional project as local and mutable presentation items, with `isInherited` set to false.
- **FR-005**: `resolveEffectivePolicies` MUST include only active policies and MUST order each layer by priority descending, matching the current Python behavior.
- **FR-006**: System MUST expose `resolveAllPolicies(orgId, userId, projectId?)` returning a single merged policy list containing every policy from the effective inherited and local layers.
- **FR-007**: `resolveAllPolicies` MUST sort policies by priority descending and MUST order inherited policies before local policies whenever priorities are equal.
- **FR-008**: System MUST expose `resolveEffectiveObjectives(orgId, userId, projectId?)` returning `{ inherited, local }` objective lists for the caller organization.
- **FR-009**: `resolveEffectiveObjectives` MUST classify objectives from ancestor teams as inherited and objectives from the user's own team, direct user scope, and optional project as local.
- **FR-010**: `resolveEffectiveObjectives` MUST include only active objectives and MUST preserve the legacy Python resolver's ordering for team, user, and project objective groups.
- **FR-011**: System MUST expose the equivalent all-objectives behavior currently used for template injection, returning a flat list of all effective objective titles with inherited titles before local titles, unless the existing Governance contract is intentionally updated in the same feature.
- **FR-012**: All policy and objective resolution behavior MUST be covered by characterization fixtures that run against both the legacy Python implementation and the new TypeScript implementation, with identical observable output required before completion.
- **FR-013**: Resolution MUST read current committed policy, objective, user, project, and team-chain state on every call; no cache, memoization, request-global reuse, or invalidation-dependent shortcut may serve resolver results.
- **FR-014**: Resolution MUST preserve organization boundaries for every user, team, project, policy, and objective lookup and MUST deny cross-organization identifiers without revealing foreign data.
- **FR-015**: System MUST provide a named local-count read operation, such as `countLocalPoliciesAndObjectives(orgId, teamOrUserId)`, that returns the number of active policies and objectives directly attached to the requested team or user node.
- **FR-016**: The local-count operation MUST count only local records for the requested node; inherited ancestor records, unrelated project records, inactive policies, and inactive objectives MUST be excluded.
- **FR-017**: The feature MUST NOT introduce new policy merge semantics, objective inheritance semantics, route-level permissions, UI surfaces, or caching behavior beyond the resolution/count contracts listed here.

### Key Entities

- **Effective Policy Set**: The two-layer result for a user and optional project. `inherited` contains active ancestor-team policies; `local` contains active own-team and project policies. Each item exposes whether it is inherited for read-only/mutable presentation.
- **Merged Policy List**: A flat list of all effective policies sorted by priority descending, with inherited policies winning equal-priority ties.
- **Effective Objective Set**: The two-layer result for a user and optional project. `inherited` contains active ancestor-team objectives; `local` contains active own-team, user-personal, and project objectives. Parent-objective links remain objective metadata and do not cause recursive inclusion by themselves.
- **Team Chain**: The Identity Access-provided ordered chain for a team, from the user's own team to the root team. Resolution depends on this order and does not define a separate hierarchy traversal contract.
- **Local Governance Count**: A per-node aggregate used by the Governance scope tree to show how many active policies and objectives are directly attached to a team or user node.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For every policy characterization fixture, `resolveEffectivePolicies` returns inherited/local membership, ordering, and inherited flags identical to the current Python resolver.
- **SC-002**: For every merged-policy characterization fixture, `resolveAllPolicies` returns ordering identical to current Python `resolve_all_policies`, including inherited-before-local ties at equal priority.
- **SC-003**: For every objective characterization fixture, `resolveEffectiveObjectives` and the flat objective-title behavior return membership, ordering, inherited flags, and titles identical to the current Python resolver.
- **SC-004**: A read immediately following a committed policy, objective, or team-parent change observes the new state in 100% of freshness tests; no test may pass by invalidating or warming a resolver cache.
- **SC-005**: Cross-organization user, team, project, policy, and objective identifiers produce not-found-equivalent denial with zero leaked records across 100% of tenant-isolation fixtures.
- **SC-006**: Local-count fixtures for team and user nodes return exact active local policy-plus-objective totals and exclude inherited, unrelated, and inactive records.

## Assumptions

- Policy and Objective CRUD/list behavior, persistence shape, validation rules, and audit events are owned by `specs/017-policy-model-crud` and `specs/001-objective-model-crud`; this feature consumes those records and does not redesign their lifecycle.
- Identity Access's `getTeamChain` contract is already implemented and stable as `getTeamChain(organizationId, teamId)`, returning self-first/root-last ordering.
- The optional project id is validated or resolved through the owning bounded context contract before project-scoped records are included.
- The local-count query is included here because the Governance views UI depends on it, but it is not a new resolution primitive and does not change inherited/local semantics.
- Characterization parity against Python is the deciding source of truth for behavior that is not otherwise visible in the written requirements.
