# Research: Governance Tenant Isolation Tests

## Decision: Add a dedicated Governance RLS migration after objective/policy migrations

**Rationale**: `0009_governance_policies.sql` and `0010_governance_objectives.sql` create the two target tables and grants but intentionally defer RLS to this feature. A new `0011_governance_rls.sql` keeps the security boundary change reviewable and aligns with Identity Access migration `0007_identity_access_rls.sql`.

**Alternatives considered**: Amending older migrations would rewrite already-merged history. Embedding RLS in application services would fail the requirement for independent database enforcement.

## Decision: Use direct `organization_id = current_setting(...)` predicates

**Rationale**: Both Governance tables have direct `organization_id` columns, so the RLS predicate can match the existing Identity Access pattern without joins. This keeps RLS cheap and mirrors the app-layer primary tenant filter.

**Alternatives considered**: Deriving tenant through team/project joins is unnecessary because Governance policy/objective records already persist `organization_id`. Schema-per-tenant was rejected by the project constitution.

## Decision: Reuse `assertCrossTenantDenied` without changing its public signature

**Rationale**: The existing helper already accepts a generic async `fetchResourceById` callback and treats thrown, falsy, or empty-array results as denial. Governance read and write checks can adapt to that shape by returning the affected row for successful writes and empty results for denied writes.

**Alternatives considered**: A Governance-only helper would violate FR-014/FR-015. Extending the shared helper is unnecessary unless implementation reveals a write adapter gap.

## Decision: Document query audit in the Governance application folder

**Rationale**: The spec requires every policy/objective service query to be audited for `organization_id` filtering. A compact `src/bcs/governance/application/query-audit.md` near the audited code is easier to keep current than burying the result in a PR body.

**Alternatives considered**: Adding assertion-only tests for every existing service duplicates the CRUD feature coverage. Relying only on code review leaves SC-004 without a durable artifact.
