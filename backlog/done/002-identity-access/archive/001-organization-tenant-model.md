---
epic: 002-identity-access
feature: 001-organization-tenant-model
status: done
dependencies: ["backlog/001-typescript-refactor-foundation/EPIC.md"]
---

# Organization Tenant Model

Introduce `Organization` as an explicit tenant-root aggregate above `Team`, per PDR-003 — the foundational multi-tenancy decision the whole SaaS business model depends on. Self-hosted installs get exactly one `organizations` row, created at bootstrap; the managed SaaS gets many.

## Requirements

- [X] `identity_access.organizations` table: `id`, `name`, `slug` (unique), `plan_id` (pointer into `billing.plans`, nullable until epic 009 exists), `stripe_customer_id` (nullable), `created_at`, `updated_at`
- [X] `Organization` is the root of every `organization_id` foreign key across all seven schemas (this feature defines the table; later features/epics add the FK as their own tables are created)
- [X] Self-hosted bootstrap: on first run with zero organizations, creates exactly one `Organization` + root `Team` + admin `User` in one transaction (replaces today's `register_admin` behavior, which conflates org creation with team creation) — **mechanism done, real rows pending**: `bootstrapOrganization` implements the transactional mechanism with a composable `provisionTeamAndAdmin` seam (tested with a stub); real `Team`/`User` rows land with `002-team-hierarchy.md`/`003-user-accounts-and-registration.md`, built immediately next in this same epic — see `specs/005-org-tenant-model/`
- [X] Application-layer guard: self-hosted mode refuses to create a second `Organization` (matches "Free = self-hosted only, one org per install" from the architecture)

## Acceptance Criteria

- [X] Fresh self-hosted install: first registration creates one org, one root team, one admin user — verified by test — **exception, marked done by explicit user decision 2026-07-22 despite this criterion not being independently verified by a real end-to-end test**: `bootstrapOrganization`'s transactional mechanism is tested (via a stub `provisionTeamAndAdmin`), but real `Team`/`User` row creation depends on `002-team-hierarchy.md`/`003-user-accounts-and-registration.md`, not yet built at archive time — user chose to archive now and build those two next in immediate succession, same "mark done anyway" call made for `001-typescript-refactor-foundation/004-ci-pipeline`'s branch-protection gap (see `[[project_epic_001_progress]]` memory)
- [X] Attempting to create a second organization in self-hosted mode is rejected
- [X] `organizations.slug` uniqueness enforced at the DB level

## Open Questions

- None — this is a direct implementation of PDR-003.

## Dependencies

- `backlog/001-typescript-refactor-foundation/002-drizzle-shared-db-kernel.md`
- `backlog/000-foundations/002-database-schema-and-tenancy-conventions.md`

## Technical Notes

Per `bcs/identity-access/CONTRACT.md`, exposes `getOrganization(organizationId)` returning the `OrgSummary` shape only — never the raw row — to other bounded contexts. Per PDR-003's stated risk, every query helper this and later features build must take `organizationId` as a required argument, never an optional filter.
