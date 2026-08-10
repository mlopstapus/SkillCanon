---
epic: 002-identity-access
feature: 007-tenant-isolation-tests-and-rls
status: done
dependencies: ["001-organization-tenant-model.md", "002-team-hierarchy.md", "003-user-accounts-and-registration.md", "006-api-keys.md"]
---

# Tenant Isolation Tests & RLS

Enable Postgres RLS on every `identity_access.*` table and build the reusable cross-tenant-denial test helper that every subsequent bounded-context epic's own tenant-isolation-tests feature will import, per tenets M1/M2/M3. This is the feature that makes multi-tenancy a proven property of the system, not just an assumed one.

## Requirements

- [X] RLS policies enabled on `organizations`, `teams`, `users`, `invitations`, `api_keys`, keyed off the session variable mechanism from `context/database-conventions.md`
- [X] Every service-layer query in this epic's other features filters by the caller's `organization_id` — audited/reviewed against this feature, not assumed
- [X] Shared test helper (`assertCrossTenantDenied`, `src/shared/testing/tenant-isolation.ts`) built and exported for reuse by other epics
- [X] One M3 negative test per resource type in this BC: a user in org A cannot read or write org B's team, user, invitation, or API key by ID

## Acceptance Criteria

- [X] For every resource type owned by this BC, a test proves cross-org access by ID is denied — not just absent from a list view
- [X] Disabling the app-layer `organization_id` filter (simulated in a test) still results in denial, because RLS independently blocks it — proves M2's "backstop, not primary control" property actually holds
- [X] The shared test helper is documented (usage example in `context/testing-strategy.md`'s "M3 cross-tenant-denial pattern" section) so later epics can find and use it without re-deriving the pattern

## Open Questions

- None — this is the concrete implementation of the pattern `context/testing-strategy.md` describes abstractly.

## Dependencies

- All other features in this epic (001–003, 006 at minimum — 004/005 benefit but aren't strictly required for the RLS/test-helper work itself)
- `backlog/000-foundations/003-testing-strategy.md`

## Technical Notes

This feature is the direct implementation of tenets M1, M2, and M3 for the Identity & Access BC, and it establishes the pattern (both the RLS policy shape and the test helper) that `005-governance`, `006-prompt-registry`, and `007-workflow-orchestration`'s own tenant-isolation-tests features will reuse rather than reinvent. Treat the test helper's API as a mini-contract of its own — changing its shape later means updating every epic that imports it.

**Delivered** (see `specs/011-tenant-isolation-rls/` for the full plan/research/data-model): RLS enabled on all five `identity_access` tables via a new hand-written migration (`drizzle/migrations/0007_identity_access_rls.sql`), with `organizations`' policy matching its own `id` rather than an `organization_id` column (it has none — PDR-003).

The single biggest discovery during implementation: RLS, applied naively, would have broken `login`, `authenticateSession`, `authenticateApiKey`, `acceptInvitation`, `logout`, and the org/team/admin bootstrap flow — all of which must resolve an identity or bootstrap a tenant *before* any organization context exists. Resolved with a second, narrowly-scoped Postgres role, `skillcanon_auth` (SELECT/INSERT/UPDATE, no DELETE, scoped to `identity_access` plus a narrow `audit.audit_events` grant for the two flows that audit-log inline) — never by weakening the tenant-scoped policy itself. A new `authDb` client (`shared/db/client.ts`) and `TestDb.authDb` (`shared/db/test-helpers.ts`) wire it through; `bcs/identity-access/CONTRACT.md` documents exactly which functions require it. `backlog/002-identity-access/008-authdb-consumer-handoff.md` tracks the forward dependency onto `008-distribution`'s route/MCP handlers, which are the first real consumers.

The audit requirement (Requirements bullet 2) found and fixed three real, pre-existing gaps, not just the anticipated ones: `getUser` and `getTeamChain` had no application-layer organization check at all (any caller could resolve any org's user/team-chain by ID); `updateTeam` had no scoping either, and — worse — would have become a *silent no-op* for a cross-org `teamId` once RLS landed, rather than a thrown denial like everything else in this BC. All three now take a mandatory (or, for `getUser`, opt-in-but-recommended) `organizationId` and throw the same not-found-equivalent error this BC already uses everywhere else for cross-org denial.

Also fixed as part of making RLS real rather than theoretical: `docker-compose.yaml`'s `app` service previously connected to Postgres as the same superuser role migrations use — meaning RLS would have had zero effect in the only deployment path that currently exists (self-hosted). It now connects via `skillcanon_app`, with `AUTH_DATABASE_URL`/`skillcanon_auth` wired in alongside it.

All 28 pre-existing identity-access test files were migrated to establish real tenant context (via `withTenantContext` for ordinary authenticated-user flows, or the `authDb` role directly for the credential-resolution/bootstrap flows) rather than running against RLS-protected tables with no context at all, which would have made every one of them fail the moment this migration landed. Full repo suite (45 files, 237 tests), typecheck, and lint all pass.
