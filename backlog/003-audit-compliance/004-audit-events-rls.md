---
epic: 003-audit-compliance
feature: 004-audit-events-rls
status: open
dependencies: ["archive/001-audit-event-schema-and-write-path.md"]
---

# Audit Events Row-Level Security

`audit.audit_events` has never had an RLS policy — confirmed still true (2026-08-08 backlog audit). `drizzle/migrations/0007_identity_access_rls.sql` explicitly grants `skillcanon_auth` plain `SELECT, INSERT` on the table with a comment stating "audit.audit_events has no RLS/tenant scoping in this feature's scope" (needed because `login()`/`acceptInvitation()` write an audit event pre-auth, before any tenant context is established). No later migration ever added a policy for the ordinary `skillcanon_app` role either — this table is the one confirmed exception to this repo's otherwise-universal M2 RLS-backstop convention (every other tenant-scoped table across every bounded context has RLS: `identity_access.*`, `governance.*`, `prompt_registry.*`, `distribution.prompt_usage`).

This gap was noted in `003-audit-compliance/EPIC.md`'s own Notes when first discovered (2026-07-23) but never filed as its own backlog item until now.

## Requirements

- [ ] Enable RLS on `audit.audit_events`, `TO skillcanon_app`, scoped by `organization_id`
- [ ] Resolve how a null `organization_id` row (schema column is nullable — confirmed via `src/bcs/audit-compliance/infrastructure/schema.ts`, presumably for a pre-org-resolution event, e.g. a failed login attempt against an unknown email across every org) interacts with the policy — a naive `organization_id = current_setting('app.current_org_id')::uuid` predicate would make every such row permanently invisible to every org-scoped reader, which may or may not be the intended behavior; decide and document, don't leave it as an accidental side effect
- [ ] Keep the existing `skillcanon_auth` permissive grant (`GRANT SELECT, INSERT ON audit.audit_events TO skillcanon_auth`, `0007_identity_access_rls.sql`) working unchanged — that role's pre-auth write path must not regress

## Acceptance Criteria

- [ ] A cross-org negative test (M3 pattern, matching every other bounded context's `tenant-isolation.test.ts`) proves an org A caller cannot read org B's audit events by ID via `skillcanon_app`, both through the app-layer query and via RLS alone (raw SQL, app-layer filter simulated as absent)
- [ ] `skillcanon_auth`'s existing pre-auth login/invitation-acceptance audit write path (tested in `002-identity-access`'s auth features) still passes unchanged

## Open Questions

- Whether null-`organization_id` events should be visible to a platform-level/superuser role only, excluded from all RLS-scoped reads entirely, or something else — no existing precedent in this codebase for a legitimately-org-less tenant-scoped row.

## Dependencies

- `archive/001-audit-event-schema-and-write-path.md`

## Technical Notes

Follow the same `EXISTS`-through-parent / direct-column RLS pattern already established for every other table (see `drizzle/migrations/0019_prompt_registry_rls.sql`, `0026_distribution_rls.sql` for the direct-column case — `audit_events.organization_id` is a direct column, not resolved via a join, so this should be the simpler shape). This is a defense-in-depth backstop (tenet M2) — the application layer already filters by `organization_id` in every real query path (per `audit-compliance/CONTRACT.md`); this closes the "app-layer bug leaks another org's audit trail" risk specifically.
