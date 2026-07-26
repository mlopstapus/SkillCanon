# Research: Policy Model & CRUD

## Decision: Add `governance.policies` with `organization_id` plus nullable scope ids

**Rationale**: The TypeScript platform uses explicit schema namespaces and tenant-scoped tables. Storing `organization_id` directly lets Governance services filter every read/write by caller organization without joining across BC-owned tables. `team_id` and `project_id` remain nullable UUIDs because a policy attaches to exactly one scope.

**Alternatives considered**: Deriving organization from team/project on every query was rejected because it would require cross-BC joins or imports and would make org-scoped get/update/delete harder to enforce consistently.

## Decision: Enforce exactly-one-scope in `createPolicy`

**Rationale**: The spec says scope reassignment after creation is out of scope, so the invariant must be checked before insert. Keeping it in the application service satisfies tenet D2 and ensures future routes/tools inherit the rule.

**Alternatives considered**: A router-level check repeats the legacy Python flaw. A DB-only check is useful defense but would not provide the domain error semantics needed by application tests.

## Decision: Validate same-organization scope through an injected verifier

**Rationale**: Team ownership belongs to Identity & Access and project ownership belongs to Prompt Registry. Prompt Registry's TypeScript project model is not implemented yet, so Governance cannot call a real `getProject()` today without violating BC boundaries or pulling forward another BC. An explicit `PolicyScopeVerifier` lets Distribution wire public BC contract calls later and lets this feature test both team/project validation paths now.

**Alternatives considered**: Importing `identity-access/infrastructure/teams-repo` directly from Governance was rejected by D1. Creating Prompt Registry project tables here was rejected as out of scope. Trusting caller-supplied org ids was rejected by M1-M3.

## Decision: Soft-delete policies

**Rationale**: The feature asks for `PolicyDeactivated` events and list operations must exclude inactive rows. `deletePolicy` therefore marks `is_active = false` instead of physically deleting, preserving audit/resource history and matching the issue's deactivate language.

**Alternatives considered**: The legacy Python CRUD physically deleted rows, but the current TypeScript governance/audit contract supersedes that with `PolicyDeactivated`.

## Decision: Audit actions use existing `resource.verb` convention

**Rationale**: Existing TypeScript audit call sites use action names such as `api_key.created` and `invitation.revoked`. Policies will use `policy.created`, `policy.updated`, and `policy.deactivated`, with `resourceType: "policy"` and `resourceId` set to the policy id.

**Alternatives considered**: PascalCase event names from `CONTRACT.md` were rejected for stored audit actions because current audit rows use lower resource-dot verbs.
