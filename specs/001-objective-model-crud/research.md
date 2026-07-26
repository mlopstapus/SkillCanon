# Research: Objective Model & CRUD

## Decision: Add `governance.objectives` with direct `organization_id` and nullable scope ids

**Rationale**: The TypeScript platform uses explicit schema namespaces and tenant-scoped tables. Storing `organization_id` directly lets Governance services filter every read/write by caller organization without joining across BC-owned tables. `team_id`, `project_id`, and `user_id` remain nullable UUIDs because the legacy Objective service permits organization-only objectives and objectives with one or more narrower scopes.

**Alternatives considered**: Deriving organization from team/project/user on every query was rejected because it would require cross-BC joins or imports and would make org-scoped get/update/delete harder to enforce consistently.

## Decision: Preserve permissive objective scoping

**Rationale**: The objective spec explicitly supersedes Policy's exactly-one-scope rule. `createObjective` and scoped parent updates validate every supplied scope id but do not require any scope id and do not reject multiple scope ids.

**Alternatives considered**: Reusing Policy's exactly-one-scope check was rejected because it would change current Python Objective behavior and violate FR-014.

## Decision: Validate same-organization scope through an injected verifier

**Rationale**: Team/user ownership belongs to Identity & Access and project ownership belongs to Prompt Registry. An explicit `ObjectiveScopeVerifier` lets Distribution wire public BC contract calls later and lets this feature test team/project/user validation paths now without Governance importing other BC internals.

**Alternatives considered**: Importing Identity or Prompt Registry infrastructure directly from Governance was rejected by D1. Trusting caller-supplied ids was rejected by M1-M3.

## Decision: Enforce parent validity and cycle rejection in application services

**Rationale**: Parent-child objectives are a Governance invariant. The service can ensure parent objectives belong to the actor organization and can walk parent links before insert/update to reject self-parenting and descendant-as-parent moves.

**Alternatives considered**: Router-level checks would duplicate domain logic across transports. A DB-only recursive constraint would not provide clear domain errors and would be harder to keep portable through the existing Drizzle migration style.

## Decision: Keep Objective delete as a hard delete with an audit event

**Rationale**: The clarified stakeholder decision is to match current Python hard-delete behavior while adding auditability. `deleteObjective` deletes the row and emits `objective.deleted`; reads and scoped active lists no longer return the deleted objective.

**Alternatives considered**: Soft-delete/status updates were rejected because they would no longer match the current Python CRUD semantics. Excluding delete from audit was rejected because all accepted mutations must be auditable.

## Decision: Audit actions use existing `resource.verb` convention

**Rationale**: Existing TypeScript audit call sites use action names such as `api_key.created` and `policy.updated`. Objectives will use `objective.created`, `objective.updated`, and `objective.deleted`, with `resourceType: "objective"` and `resourceId` set to the objective id.

**Alternatives considered**: PascalCase event names from `CONTRACT.md` were rejected for stored audit actions because current audit rows use lower resource-dot verbs.
