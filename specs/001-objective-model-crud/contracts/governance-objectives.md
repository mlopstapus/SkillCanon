# Contract: Governance Objective CRUD

These are TypeScript service contracts exposed by `src/bcs/governance/index.ts`. Transport routes/tools are out of scope for this feature.

## Shared Types

```ts
interface Objective {
  id: string;
  organizationId: string;
  teamId: string | null;
  projectId: string | null;
  userId: string | null;
  title: string;
  description: string | null;
  parentObjectiveId: string | null;
  isInherited: boolean;
  status: string;
  createdAt: Date;
}

interface ObjectiveActor {
  organizationId: string;
  userId: string;
}

interface ObjectiveScopeVerifier {
  teamBelongsToOrganization?(organizationId: string, teamId: string): Promise<boolean>;
  projectBelongsToOrganization?(organizationId: string, projectId: string): Promise<boolean>;
  userBelongsToOrganization?(organizationId: string, userId: string): Promise<boolean>;
}
```

## `createObjective(db, actor, params, scopeVerifier, auditContext?)`

Creates an objective in `actor.organizationId`. `teamId`, `projectId`, and `userId` are all optional and may be combined. `parentObjectiveId` is optional and must reference an objective in the same organization.

Errors:
- `InvalidObjectiveInputError` when `title` is blank.
- `ObjectiveScopeNotFoundError` when a supplied scope id does not belong to the actor organization, does not exist, or no verifier is supplied for that scope type.
- `ObjectiveParentNotFoundError` when the supplied parent objective does not exist in the actor organization.
- `ObjectiveCycleError` when the supplied parent link would create a cycle.

Audit:
- Writes exactly one `objective.created` event through `withAudit()`.

## `getObjective(db, actor, objectiveId)`

Returns an objective in the actor organization, or `null` when it does not exist or belongs to another organization.

## `updateObjective(db, actor, objectiveId, fields, scopeVerifier, auditContext?)`

Updates editable fields and optional scope/parent links. Organization and creation timestamp are immutable.

Errors:
- `ObjectiveNotFoundError` when the objective does not exist in the actor organization.
- `InvalidObjectiveInputError`, `ObjectiveScopeNotFoundError`, `ObjectiveParentNotFoundError`, or `ObjectiveCycleError` for invalid supplied fields.

Audit:
- Writes exactly one `objective.updated` event through `withAudit()`.

## `deleteObjective(db, actor, objectiveId, auditContext?)`

Hard-deletes an objective in the actor organization.

Errors:
- `ObjectiveNotFoundError` when the objective does not exist in the actor organization.

Audit:
- Writes exactly one `objective.deleted` event through `withAudit()`.

## `listTeamObjectives(db, actor, teamId)` / `listProjectObjectives(db, actor, projectId)` / `listUserObjectives(db, actor, userId)`

Returns active objectives for the requested scope in the actor organization ordered by `createdAt` ascending.
```
