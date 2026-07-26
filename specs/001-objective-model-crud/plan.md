# Implementation Plan: Objective Model & CRUD

**Branch**: `001-objective-model-crud` | **Date**: 2026-07-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-objective-model-crud/spec.md`

## Summary

Port the current Python `Objective` CRUD/list behavior into the TypeScript Governance bounded context. Add a `governance.objectives` table, domain/application/repository modules, and tests proving permissive organization/team/project/user scoping, same-organization validation, objective tree cycle rejection, hard delete behavior, active-only created-asc list ordering, and in-transaction audit writes. The service owns Governance invariants, while cross-BC ownership checks are supplied through an explicit scope verifier dependency so Governance does not import Identity or Prompt Registry internals.

## Technical Context

**Language/Version**: TypeScript 5.9 on Node.js >=24

**Primary Dependencies**: Next.js app workspace, Drizzle ORM, postgres.js, Vitest, Testcontainers PostgreSQL, audit-compliance `record()`, shared `withAudit()`

**Storage**: PostgreSQL via Drizzle; new `governance.objectives` table in the existing `governance` schema

**Testing**: Vitest integration tests using `startTestDb()` and migrated Testcontainers PostgreSQL

**Target Platform**: Server-side TypeScript modules consumed by future Distribution routes/tools

**Project Type**: Single Next.js/TypeScript application with bounded-context service modules under `src/bcs`

**Performance Goals**: List operations use indexed scope predicates and creation-time ordering; cycle validation walks parent links by id and is scoped to one organization

**Constraints**: Preserve BC boundaries; allow organization-only and multi-scope objectives; enforce same-organization and acyclic parent links in application services; every accepted mutation uses `withAudit()` and fails atomically if audit fails; inactive objectives are excluded from list operations

**Scale/Scope**: One table and seven application operations: `createObjective`, `getObjective`, `updateObjective`, `deleteObjective`, `listTeamObjectives`, `listProjectObjectives`, `listUserObjectives`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Test-First Development `[P1]`**: PASS. Tasks require failing Vitest integration tests before implementation for CRUD, tenant boundaries, tree validation, list behavior, and audit behavior.
- **II. Domain-Driven Bounded Contexts `[D1]`**: PASS. Governance owns only `src/bcs/governance/*` and consumes other BC ownership knowledge through an injected verifier contract, not direct imports from Identity/Prompt Registry internals.
- **III. Domain Invariants Live in Domain Layer `[D2]`**: PASS. Scope ownership and parent-cycle validation live in objective application services, not route handlers.
- **IV. Multi-Tenant Isolation by Default `[M1-M3]`**: PASS with documented scope. `governance.objectives` stores `organization_id`; all service queries filter by organization; negative cross-org get/update/delete/scope tests are required. RLS for `governance.*` remains owned by backlog `005-governance/004-governance-tenant-isolation-tests.md`.
- **V. Secure by Default `[S1-S3]`**: PASS. No secrets are introduced or logged.
- **VI. Auditable & Compliant `[C1-C2]`**: PASS. Create/update/delete use `withAudit()` and `audit-compliance.record()` with action names `objective.created`, `objective.updated`, and `objective.deleted`.
- **VII. Feature-Gated by Entitlement `[G1]`**: PASS. This feature exposes no route, UI, or MCP tool; future Distribution surfaces that call these services must gate at their transport boundary.

## Project Structure

### Documentation (this feature)

```text
specs/001-objective-model-crud/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── governance-objectives.md
└── tasks.md
```

### Source Code (repository root)

```text
src/bcs/governance/
├── index.ts
├── CONTRACT.md
├── domain/
│   └── objective.ts
├── application/
│   ├── create-objective.ts
│   ├── create-objective.test.ts
│   ├── get-objective.ts
│   ├── get-objective.test.ts
│   ├── update-objective.ts
│   ├── update-objective.test.ts
│   ├── delete-objective.ts
│   ├── delete-objective.test.ts
│   ├── list-team-objectives.ts
│   ├── list-team-objectives.test.ts
│   ├── list-project-objectives.ts
│   ├── list-project-objectives.test.ts
│   ├── list-user-objectives.ts
│   ├── list-user-objectives.test.ts
│   └── objective-test-helpers.ts
└── infrastructure/
    ├── schema.ts
    └── objectives-repo.ts

drizzle/migrations/
└── 0010_governance_objectives.sql
```

**Structure Decision**: Follow the established bounded-context layout under `src/bcs/<context>/{domain,application,infrastructure}`. No route/UI/MCP files are added; Distribution owns transport adaptation and entitlement gates later.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Governance objective RLS deferred | Backlog `005-governance/004-governance-tenant-isolation-tests.md` already owns RLS for `governance.policies` and `governance.objectives` using the shared helper once both tables exist | Adding partial RLS here would split one explicit governance tenant-isolation feature across changes and duplicate its planned test scope |
| Concurrent cycle rejection verified at service level | The current feature has no lock manager or route transaction orchestrator beyond Drizzle transactions | A DB recursive constraint is not portable through Drizzle migrations and would introduce database-specific complexity before resolution depends on objectives |

## Phase 0: Research

See [research.md](./research.md).

## Phase 1: Design & Contracts

See [data-model.md](./data-model.md), [contracts/governance-objectives.md](./contracts/governance-objectives.md), and [quickstart.md](./quickstart.md).

## Post-Design Constitution Check

- **P1**: PASS. `tasks.md` requires tests before each implementation slice.
- **D1/D2**: PASS. Scope verifier dependency keeps cross-BC checks at an explicit contract boundary and keeps invariants inside Governance application services.
- **M1-M3**: PASS. Every repo/service read uses `organization_id`; cross-org tests are planned. RLS remains documented in Complexity Tracking.
- **C1-C2**: PASS. Mutation tasks include audit event assertions and `withAudit()` implementation tasks.
- **G1**: PASS. No new transport surface is introduced.
