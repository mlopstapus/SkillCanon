# Implementation Plan: Distribution Tenant Isolation Tests

**Branch**: `030-distribution-tenant-isolation` | **Date**: 2026-08-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/030-distribution-tenant-isolation/spec.md`

## Summary

Enable PostgreSQL row-level security on `distribution.prompt_usage` — the only table in the `distribution` schema, and the only one still missing RLS following `008-distribution/004-usage-telemetry`'s (shipped as `001-usage-telemetry`) schema/query-surface expansion — then prove tenant isolation through the existing shared `assertCrossTenantDenied` helper, matching the pattern already used by Identity Access (`0007`), Governance (`0011`), and Prompt Registry (`0019`). The implementation adds one RLS migration, one Distribution tenant-isolation Vitest file (app-layer + RLS-alone read/write denial, including a raw-SQL update/delete check since `prompt_usage` has no application-layer update/delete path — same shape already proven for Prompt Registry's immutable `prompt_versions`), and a documented query audit covering `recordPromptUsage`, `getPromptUsageSummaryForProject`, and `getPromptUsageSummaryForOrganization`.

## Technical Context

**Language/Version**: TypeScript 5.9 on Node.js >=24

**Primary Dependencies**: Drizzle ORM, postgres.js, Vitest, Testcontainers PostgreSQL, shared `withTenantContext()`, shared `assertCrossTenantDenied()`

**Storage**: PostgreSQL; existing `distribution.prompt_usage` table (all 13 columns as of `0025_distribution_usage_telemetry.sql`: `id`, `organization_id`, `prompt_id`, `prompt_version_id`, `prompt_version`, nullable `project_id`, nullable `user_id`, `status_code`, nullable `latency_ms`, nullable `git_remote_url`, nullable `git_branch`, nullable `git_commit_sha`, `created_at`)

**Testing**: Vitest integration tests using `startTestDb()` and migrated Testcontainers PostgreSQL

**Target Platform**: Server-side TypeScript bounded-context modules in the Next.js app workspace

**Project Type**: Single Next.js/TypeScript application with bounded-context modules under `src/bcs`

**Performance Goals**: RLS predicate uses the existing indexed `organization_id` column directly (no join needed — `prompt_usage` carries its own `organization_id`, unlike `prompt_versions`/`project_teams`) and adds no per-row application calls

**Constraints**: Reuse the shared tenant-isolation helper as-is (no extension needed — the `prompt_versions` precedent already covers the "immutable, raw-SQL-only write check" shape this table needs); preserve application-layer `organization_id` filters as the primary control; do not add routes, UI, or entitlement-gated surfaces in this feature (`GET /api/metrics`/`/metrics` already exist from `001-usage-telemetry` and are unchanged)

**Scale/Scope**: One tenant-scoped Distribution table, one migration, one bounded-context tenant-isolation test file, one query-audit artifact

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Test-First Development `[P1]`**: PASS. Tasks require a failing Distribution tenant-isolation test before/alongside the RLS migration.
- **II. Domain-Driven Bounded Contexts `[D1]`**: PASS. Changes stay within `src/bcs/distribution/`, shared database/testing helpers, and Distribution documentation. No cross-BC ORM imports are introduced.
- **III. Domain Invariants Live in Domain Layer `[D2]`**: PASS. This feature adds database isolation and verifies existing service scoping; it does not move domain rules into transport handlers.
- **IV. Multi-Tenant Isolation by Default `[M1-M3]`**: PASS. This feature enables RLS on the one remaining Distribution table and proves cross-tenant read/write denial for the usage resource.
- **V. Secure by Default `[S1-S3]`**: PASS. No secrets, tokens, logging, or template rendering paths are introduced.
- **VI. Auditable & Compliant `[C1-C2]`**: PASS. No new mutation service is added; the audit verifies existing Distribution mutation/read queries (`recordPromptUsage`, both summary functions) stay organization-scoped. Usage telemetry itself is explicitly not the SOC2 audit trail (see `CONTRACT.md`), unaffected by this feature.
- **VII. Feature-Gated by Entitlement `[G1]`**: PASS. No new REST route, UI surface, or MCP tool is introduced; `GET /api/metrics`/`/metrics` already shipped and gated (via `assertCoreFeaturesEnabled`) under `001-usage-telemetry`.

## Project Structure

### Documentation (this feature)

```text
specs/030-distribution-tenant-isolation/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── distribution-tenant-isolation.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
drizzle/migrations/
└── 0026_distribution_rls.sql        (new)

src/bcs/distribution/
├── application/
│   ├── query-audit.md               (new)
│   └── tenant-isolation.test.ts     (new)
└── infrastructure/
    └── schema.ts                     (unchanged — already has organization_id)

src/shared/testing/
└── tenant-isolation.ts              (reused as-is, not forked)
```

**Structure Decision**: Follow the existing Identity Access / Governance / Prompt Registry RLS implementation pattern exactly. Add Distribution-specific tests under the Distribution bounded context and keep the shared helper in `src/shared/testing/tenant-isolation.ts` unchanged — the Prompt Registry `prompt_versions` precedent already demonstrates the "no app-layer write path, raw-SQL-only denial check" shape this feature needs, so no helper extension is anticipated.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |

## Phase 0: Research

See [research.md](./research.md).

## Phase 1: Design & Contracts

See [data-model.md](./data-model.md), [contracts/distribution-tenant-isolation.md](./contracts/distribution-tenant-isolation.md), and [quickstart.md](./quickstart.md).
