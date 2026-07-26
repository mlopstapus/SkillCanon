# Implementation Plan: Governance Tenant Isolation Tests

**Branch**: `001-governance-tenant-isolation-tests` | **Date**: 2026-07-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-governance-tenant-isolation-tests/spec.md`

## Summary

Enable PostgreSQL row-level security for `governance.policies` and `governance.objectives`, then prove Governance tenant isolation through the existing shared `assertCrossTenantDenied` helper. The implementation adds an RLS migration, direct RLS-backed Vitest coverage for policy/objective reads and writes, and a documented query audit confirming the existing Governance CRUD services already constrain tenant-scoped operations by `organization_id`.

## Technical Context

**Language/Version**: TypeScript 5.9 on Node.js >=24

**Primary Dependencies**: Drizzle ORM, postgres.js, Vitest, Testcontainers PostgreSQL, shared `withTenantContext()`, shared `assertCrossTenantDenied()`

**Storage**: PostgreSQL; existing `governance.policies` and `governance.objectives` tables in the `governance` schema

**Testing**: Vitest integration tests using `startTestDb()` and migrated Testcontainers PostgreSQL

**Target Platform**: Server-side TypeScript bounded-context modules in the Next.js app workspace

**Project Type**: Single Next.js/TypeScript application with bounded-context modules under `src/bcs`

**Performance Goals**: RLS predicates use the existing indexed `organization_id` columns and do not add joins or per-row application calls

**Constraints**: Reuse the shared tenant-isolation helper; preserve application-layer `organization_id` filters as the primary control; do not add routes, UI, MCP tools, or entitlement-gated surfaces in this feature

**Scale/Scope**: Two tenant-scoped Governance tables, one migration, one bounded-context tenant isolation test file, and one query-audit artifact

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Test-First Development `[P1]`**: PASS. Tasks require failing Governance tenant-isolation tests before the RLS migration is implemented.
- **II. Domain-Driven Bounded Contexts `[D1]`**: PASS. Changes stay within shared database/testing helpers, Governance schema/tests, and Governance documentation. No cross-BC ORM imports are introduced.
- **III. Domain Invariants Live in Domain Layer `[D2]`**: PASS. This feature adds database isolation and verifies existing service scoping; it does not move domain rules into transport handlers.
- **IV. Multi-Tenant Isolation by Default `[M1-M3]`**: PASS. This feature directly enables RLS and proves cross-tenant read/write denial for both Governance resource types.
- **V. Secure by Default `[S1-S3]`**: PASS. No secrets, tokens, logging, or template rendering paths are introduced.
- **VI. Auditable & Compliant `[C1-C2]`**: PASS. No new mutation service is added; the audit verifies existing Governance mutation queries stay organization-scoped and existing CRUD features retain their audit behavior.
- **VII. Feature-Gated by Entitlement `[G1]`**: PASS. No new REST route, UI surface, or MCP tool is introduced.

## Project Structure

### Documentation (this feature)

```text
specs/001-governance-tenant-isolation-tests/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── governance-tenant-isolation.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
drizzle/migrations/
└── 0011_governance_rls.sql

src/bcs/governance/
├── application/
│   ├── query-audit.md
│   └── tenant-isolation.test.ts
└── infrastructure/
    └── schema.ts

src/shared/testing/
└── tenant-isolation.ts
```

**Structure Decision**: Follow the existing Identity Access RLS implementation pattern. Add Governance-specific tests under the Governance bounded context and keep the shared helper in `src/shared/testing/tenant-isolation.ts` only if reusable extension is required.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |

## Phase 0: Research

See [research.md](./research.md).

## Phase 1: Design & Contracts

See [data-model.md](./data-model.md), [contracts/governance-tenant-isolation.md](./contracts/governance-tenant-isolation.md), and [quickstart.md](./quickstart.md).

## Post-Design Constitution Check

- **P1**: PASS. Tasks include red tests for RLS denial before the migration implementation.
- **D1/D2**: PASS. Tests and RLS stay within Governance/shared testing boundaries; service invariants remain in application services.
- **M1-M3**: PASS. RLS policies and cross-tenant denial tests cover both `governance.policies` and `governance.objectives`; the query audit covers application-layer filters.
- **S1-S3**: PASS. No secret or logging paths change.
- **C1-C2**: PASS. No new mutation path bypasses audit; existing mutation paths are part of the organization-filter audit.
- **G1**: PASS. No user-facing or executable feature surface is introduced.
