# Implementation Plan: Policy Model & CRUD

**Branch**: `017-policy-model-crud` | **Date**: 2026-07-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/017-policy-model-crud/spec.md`

## Summary

Port the current Python `Policy` CRUD/list behavior into the TypeScript Governance bounded context. Add a `governance.policies` table, domain/application/repository modules, and tests proving scope exclusivity, same-organization validation, org-scoped get/update/deactivate, active-only priority-desc list ordering, and in-transaction audit writes. The service owns Governance invariants, while cross-BC ownership checks are supplied through an explicit scope-verifier dependency so Governance does not import Identity or Prompt Registry internals.

## Technical Context

**Language/Version**: TypeScript 5.9 on Node.js >=24

**Primary Dependencies**: Next.js app workspace, Drizzle ORM, postgres.js, Vitest, Testcontainers PostgreSQL, audit-compliance `record()`, shared `withAudit()`

**Storage**: PostgreSQL via Drizzle; new `governance.policies` table in the existing `governance` schema

**Testing**: Vitest integration tests using `startTestDb()` and migrated Testcontainers PostgreSQL

**Target Platform**: Server-side TypeScript modules consumed by future Distribution routes/tools

**Project Type**: Single Next.js/TypeScript application with bounded-context service modules under `src/bcs`

**Performance Goals**: List operations use indexed scope predicates and priority ordering; no additional caching because Governance reads must be read-your-writes consistent per `src/bcs/governance/CONTRACT.md`

**Constraints**: Preserve BC boundaries; enforce scope exclusivity and same-org validation in application service; every mutation uses `withAudit()` and fails atomically if audit fails; inactive policies are excluded from list operations

**Scale/Scope**: One table and six application operations: `createPolicy`, `getPolicy`, `updatePolicy`, `deletePolicy`, `listTeamPolicies`, `listProjectPolicies`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Test-First Development `[P1]`**: PASS. Tasks require failing Vitest integration tests before implementation for create, lifecycle, and list behavior.
- **II. Domain-Driven Bounded Contexts `[D1]`**: PASS. Governance owns only `src/bcs/governance/*` and consumes other BC ownership knowledge through an injected verifier contract, not direct imports from Identity/Prompt Registry internals.
- **III. Domain Invariants Live in Domain Layer `[D2]`**: PASS. The exactly-one-scope and same-organization checks live in `createPolicy`, not in a route handler.
- **IV. Multi-Tenant Isolation by Default `[M1-M3]`**: PASS with documented scope. `governance.policies` stores `organization_id`; all service queries filter by organization; negative cross-org get/update/delete tests are required. RLS for `governance.*` remains owned by backlog `005-governance/004-governance-tenant-isolation-tests.md`.
- **V. Secure by Default `[S1-S3]`**: PASS. No secrets are introduced or logged.
- **VI. Auditable & Compliant `[C1-C2]`**: PASS. Create/update/deactivate use `withAudit()` and `audit-compliance.record()` with action names `policy.created`, `policy.updated`, and `policy.deactivated`.
- **VII. Feature-Gated by Entitlement `[G1]`**: PASS. This feature exposes no route, UI, or MCP tool; future Distribution surfaces that call these services must gate at their transport boundary.

## Project Structure

### Documentation (this feature)

```text
specs/017-policy-model-crud/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── governance-policies.md
└── tasks.md
```

### Source Code (repository root)

```text
src/bcs/governance/
├── index.ts
├── domain/
│   └── policy.ts
├── application/
│   ├── create-policy.ts
│   ├── create-policy.test.ts
│   ├── get-policy.ts
│   ├── get-policy.test.ts
│   ├── update-policy.ts
│   ├── update-policy.test.ts
│   ├── delete-policy.ts
│   ├── delete-policy.test.ts
│   ├── list-team-policies.ts
│   ├── list-team-policies.test.ts
│   ├── list-project-policies.ts
│   └── list-project-policies.test.ts
└── infrastructure/
    ├── schema.ts
    └── policies-repo.ts

drizzle/migrations/
└── 0009_governance_policies.sql
```

**Structure Decision**: Follow the established bounded-context layout under `src/bcs/<context>/{domain,application,infrastructure}`. No route/UI files are added; Distribution owns transport adaptation and entitlement gates later.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Governance policy RLS deferred | Backlog `005-governance/004-governance-tenant-isolation-tests.md` already owns RLS for `governance.policies` and `governance.objectives` using the shared helper once both tables exist | Adding a partial RLS migration here would split one explicit governance tenant-isolation feature across two changes and duplicate its planned test scope |

## Phase 0: Research

See [research.md](./research.md).

## Phase 1: Design & Contracts

See [data-model.md](./data-model.md), [contracts/governance-policies.md](./contracts/governance-policies.md), and [quickstart.md](./quickstart.md).

## Post-Design Constitution Check

- **P1**: PASS. `tasks.md` requires tests before each implementation slice.
- **D1/D2**: PASS. Scope verifier dependency keeps cross-BC checks at an explicit contract boundary and keeps invariants inside Governance application services.
- **M1-M3**: PASS. Every repo/service read uses `organization_id`; cross-org tests are planned. RLS remains documented in Complexity Tracking.
- **C1-C2**: PASS. Mutation tasks include audit event assertions and `withAudit()` implementation tasks.
- **G1**: PASS. No new transport surface is introduced.
