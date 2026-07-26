# Contract: Governance Policy CRUD

These are TypeScript service contracts exposed by `src/bcs/governance/index.ts`. Transport routes/tools are out of scope for this feature.

## Shared Types

```ts
type EnforcementType = "prepend" | "append" | "inject" | "validate";

interface Policy {
  id: string;
  organizationId: string;
  teamId: string | null;
  projectId: string | null;
  name: string;
  description: string | null;
  enforcementType: EnforcementType;
  content: string;
  priority: number;
  isActive: boolean;
  createdAt: Date;
  isInherited: false;
}

interface PolicyActor {
  organizationId: string;
  userId: string;
}

interface PolicyScopeVerifier {
  teamBelongsToOrganization?(organizationId: string, teamId: string): Promise<boolean>;
  projectBelongsToOrganization?(organizationId: string, projectId: string): Promise<boolean>;
}
```

## `createPolicy(db, actor, params, scopeVerifier, auditContext?)`

Creates an active policy scoped to exactly one team/project in `actor.organizationId`.

Errors:
- `InvalidPolicyScopeError` when both or neither scope ids are supplied.
- `PolicyScopeNotFoundError` when the supplied scope does not belong to the actor organization, does not exist, or no verifier is supplied for that scope type.

Audit:
- Writes exactly one `policy.created` event through `withAudit()`.

## `getPolicy(db, actor, policyId)`

Returns a policy in the actor organization, or `null` when it does not exist or belongs to another organization.

## `updatePolicy(db, actor, policyId, fields, auditContext?)`

Updates only editable fields. Scope and organization are immutable.

Errors:
- `PolicyNotFoundError` when the policy does not exist in the actor organization.

Audit:
- Writes exactly one `policy.updated` event through `withAudit()`.

## `deletePolicy(db, actor, policyId, auditContext?)`

Soft-deactivates a policy in the actor organization. Repeated calls on an inactive policy are no-ops.

Errors:
- `PolicyNotFoundError` when the policy does not exist in the actor organization.

Audit:
- Writes exactly one `policy.deactivated` event only when the call changes an active policy to inactive.

## `listTeamPolicies(db, actor, teamId)` / `listProjectPolicies(db, actor, projectId)`

Returns active policies for the requested scope in the actor organization ordered by `priority` descending.
