# Research: Project Model & Membership

## Decision: Use Prompt Registry domain/application services with verifier interfaces for Identity references

**Rationale**: The constitution requires bounded contexts to consume each other through contracts. Existing Governance services accept scope verifier callbacks for team/project existence and never import another context's infrastructure schema into application logic. Prompt Registry should mirror that style with a `ProjectIdentityVerifier` that checks organization, team, and user membership through Identity & Access public APIs.

**Alternatives considered**: Direct Drizzle joins against `identity_access.*` would be simpler but violates D1 and FR-022. Database foreign keys to identity tables would enforce referential integrity but couple Prompt Registry storage to Identity internals and complicate RLS ownership.

## Decision: Store `organization_id` directly on `prompt_registry.projects`

**Rationale**: The issue and spec require it, and it gives every project read/update/delete query a direct tenant predicate. Membership rows remain tenant-resolvable through their required project join, while project service APIs always take organization scope.

**Alternatives considered**: Deriving organization solely through the owning team would reduce one column but conflict with FR-001 and make Prompt Registry queries depend on Identity tables.

## Decision: Enforce same-organization invariants in application services before transactional mutation

**Rationale**: The application layer can call Identity & Access public read contracts before writing. This keeps failed/rejected mutations outside `withAudit`, satisfying FR-021: no audit event is written when validation fails.

**Alternatives considered**: Database triggers could enforce cross-table checks, but they would need Identity internal reads and would produce database-specific errors instead of domain errors.

## Decision: Use persisted unique indexes for project names, project slugs, and project membership

**Rationale**: The spec requires persisted uniqueness, including concurrent duplicate member additions. Unique indexes on `(organization_id, name)`, `(organization_id, slug)`, and `(project_id, user_id)` provide the race-safe guarantee; services translate uniqueness failures into domain errors.

**Alternatives considered**: Preflight select checks are useful for clearer errors but cannot satisfy concurrent uniqueness by themselves.

## Decision: Hard-delete projects and cascade memberships

**Rationale**: The spec says delete should remove projects from reads/lists and associated membership grants should no longer be returned. A foreign key cascade from project members to projects is the simplest durable rule for the first Prompt Registry tables.

**Alternatives considered**: Soft-delete would preserve rows but requires `deleted_at` fields not in FR-001/FR-002 and would complicate uniqueness semantics for names/slugs.

## Decision: Use `withAudit` and Audit & Compliance `record()` for all successful mutations

**Rationale**: Existing identity/governance mutations use this pattern so the mutation and audit event commit or roll back together. Actions use the Audit contract's canonical verbs: `project.created`, `project.updated`, `project.deleted`, `project_member.created`, and `project_member.deleted`.

**Alternatives considered**: Publishing events asynchronously would violate the spec's same-transaction audit requirement.

## Decision: Add RLS policies for both new tables

**Rationale**: The constitution requires RLS as defense in depth for every tenant-scoped table. `projects` filters directly on `organization_id`; `project_members` filters through the owning project because it is tenant-resolvable through a required join.

**Alternatives considered**: Relying only on application predicates would miss the M1-M3 defense-in-depth requirement.
