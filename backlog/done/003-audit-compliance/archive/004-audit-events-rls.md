---
epic: 003-audit-compliance
feature: 004-audit-events-rls
status: done
dependencies: ["archive/001-audit-event-schema-and-write-path.md"]
---

# Audit Events Row-Level Security

`audit.audit_events` has never had an RLS policy — confirmed still true (2026-08-08 backlog audit). `drizzle/migrations/0007_identity_access_rls.sql` explicitly grants `skillcanon_auth` plain `SELECT, INSERT` on the table with a comment stating "audit.audit_events has no RLS/tenant scoping in this feature's scope" (needed because `login()`/`acceptInvitation()` write an audit event pre-auth, before any tenant context is established). No later migration ever added a policy for the ordinary `skillcanon_app` role either — this table is the one confirmed exception to this repo's otherwise-universal M2 RLS-backstop convention (every other tenant-scoped table across every bounded context has RLS: `identity_access.*`, `governance.*`, `prompt_registry.*`, `distribution.prompt_usage`).

This gap was noted in `003-audit-compliance/EPIC.md`'s own Notes when first discovered (2026-07-23) but never filed as its own backlog item until now.

## Requirements

- [x] Enable RLS on `audit.audit_events`, `TO skillcanon_app`, scoped by `organization_id` — `drizzle/migrations/0029_audit_compliance_rls.sql`, `ENABLE`+`FORCE ROW LEVEL SECURITY` plus a direct-column `USING`/`WITH CHECK` policy
- [x] Resolve how a null `organization_id` row interacts with the policy — resolved: null rows are invisible under the `skillcanon_app` policy (a direct equality predicate never matches null), which is not a new restriction — every existing org-scoped application query already filtered `organization_id = $1`, silently excluding null rows before RLS existed too. No consumer anywhere in this codebase reads audit_events by null organization_id today (confirmed by grep). See migration file's own comment for the full reasoning.
- [x] Keep the existing `skillcanon_auth` permissive grant working unchanged — added a second, coexisting permissive policy (`audit_events_auth_bootstrap`, `TO skillcanon_auth`, `USING (true)`/`WITH CHECK (true)`), matching the same pattern already established for `identity_access.*` tables (`011-tenant-isolation-rls`)

## Acceptance Criteria

- [x] A cross-org negative test (M3 pattern, matching every other bounded context's `tenant-isolation.test.ts`) proves an org A caller cannot read org B's audit events by ID via `skillcanon_app`, both through the app-layer query and via RLS alone — `src/bcs/audit-compliance/application/tenant-isolation.test.ts` (new), 3 tests: cross-org read denial via RLS alone, cross-org insert denial, and `skillcanon_auth`'s unaffected pre-auth path
- [x] `skillcanon_auth`'s existing pre-auth login/invitation-acceptance audit write path still passes unchanged — full `identity-access`/`audit-compliance`/`governance`/`distribution` suites re-run after the RLS rollout (76 files / 363 tests, all green)

## Open Questions

- **Resolved**: null-`organization_id` events are invisible to `skillcanon_app`'s org-scoped reads (matching pre-RLS behavior exactly, since app-layer queries already filtered by a specific `organization_id`), and remain fully visible/writable via `skillcanon_auth`'s permissive policy, matching its existing role in the pre-auth login/invitation flow. No platform-level/superuser role concept exists in this codebase today, so building one for this alone was rejected as over-engineering for zero current consumers.

## Technical Notes (rollout, added post-implementation)

Enabling RLS on this table for the first time broke a substantial number of pre-existing tests across **four** bounded contexts (`audit-compliance`, `identity-access`, `governance`, plus their shared test-helper modules) that read/wrote `audit.audit_events` via `testDb.appDb` directly, unwrapped in `withTenantContext` — the same pattern already documented for `030-distribution-tenant-isolation`'s RLS rollout, but with much larger blast radius here since `audit.audit_events` is written from nearly every mutation in the system via `withAudit()`/`record()`. All fixed by wrapping the read/write in `withTenantContext`, or (for the one legitimately-null-org fixture) switching the read to `testDb.authDb`. `prompt-registry`'s shared test-helpers already read via `testDb.ownerDb` (the migration superuser, which bypasses RLS entirely) and needed no changes. Full list of touched test files: `audit-compliance/{application/record.test.ts, application/prune.test.ts, application/list-audit-actor-options.test.ts, infrastructure/audit-events-repo.test.ts}`, `identity-access/application/{accept-invitation,create-api-key,create-organization,create-team,create-user,deactivate-user,insert-team-between,invite-user,login,remove-team-member,reparent-team,revoke-api-key,revoke-invitation,update-team,update-user}.test.ts`, `governance/application/{create-objective,update-objective,delete-objective,create-policy,update-policy,delete-policy}.test.ts` plus `governance/application/{objective,policy}-test-helpers.ts`.

## Dependencies

- `archive/001-audit-event-schema-and-write-path.md`

## Technical Notes

Follow the same `EXISTS`-through-parent / direct-column RLS pattern already established for every other table (see `drizzle/migrations/0019_prompt_registry_rls.sql`, `0026_distribution_rls.sql` for the direct-column case — `audit_events.organization_id` is a direct column, not resolved via a join, so this should be the simpler shape). This is a defense-in-depth backstop (tenet M2) — the application layer already filters by `organization_id` in every real query path (per `audit-compliance/CONTRACT.md`); this closes the "app-layer bug leaks another org's audit trail" risk specifically.
