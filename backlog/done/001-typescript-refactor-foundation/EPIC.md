# Epic 001: TypeScript Refactor Foundation

**Priority:** 1
**Status:** done
**Goal:** Stand up the empty-but-real skeleton of the new unified TypeScript application — scaffolding, database wiring, module-boundary enforcement, CI, and local dev — so that every subsequent bounded-context epic is purely "add domain logic to an already-working shell," not "also figure out the plumbing."

## Overview

This is the single-unit "TypeScript refactor" epic requested up front, kept deliberately separate from the bounded-context epics that follow it. It produces no user-facing functionality on its own — when it's done, the app boots, connects to Postgres, passes an empty test suite in CI, and enforces (via lint) that bounded contexts can't reach into each other's internals. Everything in it is infrastructure, not domain logic, which is exactly why it's one unit rather than split by bounded context.

Nothing here is new product behavior — see epic 002 onward for the actual bounded-context ports (the rest of "the refactor") and epic 009 for the first genuinely new feature (Billing & Entitlements).

## Features

- [x] [001 - Next.js App Scaffolding](archive/001-nextjs-app-scaffolding.md)
- [x] [002 - Drizzle Shared DB Kernel](archive/002-drizzle-shared-db-kernel.md)
- [x] [003 - Module Boundary Lint Enforcement](archive/003-module-boundary-lint-enforcement.md)
- [x] [004 - CI Pipeline](archive/004-ci-pipeline.md)
- [x] [005 - Docker Compose Dev Environment](archive/005-docker-compose-dev-environment.md)

*Completed features are moved to `archive/` and checked off here.*

## Dependencies

- `backlog/000-foundations/001-repo-structure-and-module-boundaries.md` (blocks 001, 003)
- `backlog/000-foundations/002-database-schema-and-tenancy-conventions.md` (blocks 002)
- `backlog/000-foundations/003-testing-strategy.md` (blocks 004)

## Notes

Every bounded-context epic (002–007) depends on this epic being complete. Nothing in those epics should start until the app boots and CI is green on an empty test suite.
