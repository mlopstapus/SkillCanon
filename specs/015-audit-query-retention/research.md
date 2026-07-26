# Research: Audit Query & Retention

## Decision: Keep entitlement resolution local and fail-closed

**Rationale**: `docs/context/entitlements.md` defines Free-tier `auditRetentionDays` as 7, and the issue explicitly says to use a hardcoded Free default until epic 009 exists. No export entitlement key exists yet, so export must be denied for every org by default.

**Alternatives considered**: Importing a speculative billing-entitlements resolver was rejected because no live contract exists. Granting export by default was rejected because it violates FR-008/FR-009.

## Decision: Backend-only service functions, no route/UI/scheduler runner

**Rationale**: Existing identity-access features add bounded-context application functions first and leave route/UI integration to Distribution. The spec's own assumptions say this feature builds `list()`, `export()`, and the pruning job behavior, not the audit-log UI.

**Alternatives considered**: Adding a Next route or cron registration now was rejected as crossing ownership boundaries and creating an entitlement-gated surface before the route-layer gating primitive exists.

## Decision: Use one transactional prune function per organization

**Rationale**: The requirement is strongest at the organization level: delete rows older than that org's resolved cutoff and write exactly one `audit.pruned` event recording the deleted count. One `db.transaction()` can guarantee deletion and recording succeed or fail together.

**Alternatives considered**: A global prune over all orgs in one query was rejected because nullable/unknown-org rows and future per-org entitlements make org-specific cutoffs clearer and safer. Writing the prune event outside the delete transaction was rejected because FR-006 requires atomicity.

## Decision: CSV-only export for launch

**Rationale**: The source backlog item explicitly defers broader export formats. CSV satisfies FR-007 and is useful for compliance review without adding streaming/SIEM format design.

**Alternatives considered**: JSON export was rejected for this launch slice because the open question remains deferred and no UI/route consumer exists yet.

## Decision: Free-text search stays inside audit event fields for now

**Rationale**: The spec names action, resource type/id, and actor display name. This bounded context owns actor IDs but not user profile/display-name data. Identity Access already exposes `listUsers` through its barrel, returning presentation-safe `displayName` values scoped to the caller organization. This feature uses that public contract to resolve matching actor user IDs for human actors, then filters audit rows by those IDs along with `action`, `resourceType`, `resourceId`, `actorUserId`, and `actorApiKeyId`. API-key actor display-name search remains unavailable until an API-key summary lookup contract exists.

**Alternatives considered**: Joining directly to `identity_access.users` was rejected because it would violate the bounded-context rule against importing another context's ORM tables. Calling `listUsers` through the identity-access barrel preserves the contract boundary and satisfies the human actor-name requirement without a schema migration.
