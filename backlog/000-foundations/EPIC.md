# Epic 000: Foundations

**Priority:** 0
**Status:** in-progress
**Goal:** Establish the decisions and written conventions every subsequent epic builds on, so implementation doesn't stall on undecided questions mid-feature.

## Overview

`context/architecture.md` and `spec/tenets.md` already settled the big structural calls (bounded contexts, multi-tenancy from day one, Drizzle, AWS, entitlements-as-data). What's left are the concrete, written-down conventions that every epic from 001 onward needs to already have an answer for — how migrations are named, what an error response looks like, how a tenant-isolation test is structured, what "done" means for CI. These aren't features; each one is a decision or a piece of research that produces a permanent reference doc in `context/`.

None of epic 001 (TypeScript Refactor Foundation) should start until items 001, 002, and 003 below are resolved — the app scaffold, DB client, and CI pipeline are built directly on those answers.

## Decisions

- [x] [001 - Repo Structure & Module Boundaries](archive/001-repo-structure-and-module-boundaries.md) → `context/repo-structure.md`
- [x] [002 - Database Schema & Tenancy Conventions](archive/002-database-schema-and-tenancy-conventions.md) → `context/database-conventions.md`
- [x] [003 - Testing Strategy](archive/003-testing-strategy.md) → `context/testing-strategy.md`
- [x] [004 - API & Error Conventions](archive/004-api-and-error-conventions.md) → `context/api-conventions.md`
- [x] [005 - Deployment, Environments & AWS Topology](archive/005-deployment-environments-and-aws-topology.md) → `context/deployment.md`
- [x] [006 - Auth & Session Conventions](archive/006-auth-and-session-conventions.md) → `context/auth-conventions.md`
- [x] [007 - Entitlement Catalog](archive/007-entitlement-catalog.md) → `context/entitlements.md`
- [x] [008 - Third-Party Service Selection](archive/008-third-party-services.md) → `context/third-party-services.md`
- [x] [009 - Feature Gating & Flags](archive/009-feature-gating-and-flags.md) → `context/feature-gating.md`
- [x] [010 - Design System](archive/010-design-system.md) → `docs/context/design-system.md`
- [x] [011 - Fix Missing Migration Snapshot Files](archive/011-fix-missing-migration-snapshot-files.md) — repo-hygiene bug discovered 2026-07-27, not a convention decision like the others; tracked here since it's database-tooling and this epic already owns `002`'s migration-naming convention
- [ ] [012 - Fix Legacy Backend Import Path Mismatch](012-fix-legacy-backend-import-path-mismatch.md) — repo-hygiene bug discovered 2026-07-29 (`spechub_server` directory vs. `skillcanon_server` internal imports), same "not a convention decision, tracked here anyway" rationale as 011
- [ ] [013 - Fix Non-Idempotent Workflow Schema Drop Migration](013-fix-non-idempotent-workflow-schema-drop-migration.md) — migration-hygiene bug discovered 2026-08-02 while live-verifying `027-skill-chain-views-ui` (`0024_drop_workflow_schema.sql`'s `DROP TABLE` has no `IF EXISTS`, breaking `pnpm db:migrate` on any database that never had `workflow.workflows` in the first place), same "not a convention decision, tracked here anyway" rationale as 011/012
- [ ] [014 - Fix Missing JWT_SECRET in Compose Env](014-fix-missing-jwt-secret-compose-env.md) — compose-config bug discovered 2026-08-05 while live-verifying `031-governance-views-ui` (`docker-compose.yaml`'s `app` service has no `JWT_SECRET`, so a fresh self-hosted registration fails signing the session JWT even though the account was already created), same "not a convention decision, tracked here anyway" rationale as 011/012/013

*Completed items are moved to `archive/` and checked off here.*

## Dependencies

None — this is the starting point. Draws on `context/architecture.md` and `spec/tenets.md`, both already written.

## Notes

Items 001–003 block epic 001. Items 004–009 can happen in parallel with epic 001 but must land before the epic that needs them (006 before 002-identity-access; 007, 008, and 009 before 009-billing-entitlements; 009 also blocks any feature work in any epic per tenet G1 — every feature ships gated). Item 010 was added once UI-redesign work was scoped — its "land before that epic's design-tokens feature" deadline moved up significantly (2026-07-23) once that feature relocated to `backlog/004-app-shell-and-landing/001-design-tokens-and-theming.md`, much earlier than its original slot in what's now `010-ui-polish-and-accessibility`; extract palette/typography from the mockups already produced in Claude design rather than deciding brand direction from scratch.
