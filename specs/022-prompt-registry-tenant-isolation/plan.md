# Implementation Plan: Prompt Registry Tenant Isolation Tests

**Branch**: `022-prompt-registry-tenant-isolation` | **Date**: 2026-07-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/022-prompt-registry-tenant-isolation/spec.md`

## Summary

Enable PostgreSQL row-level security for the five `prompt_registry` tables that do not yet have it (`prompts`, `prompt_versions`, `subscriptions`, `project_teams`, `project_skill_assignments` — `projects`/`project_members` already got RLS in `0012_prompt_registry_projects.sql`), then prove tenant isolation for all six spec-named tables through the existing shared `assertCrossTenantDenied` helper, matching the pattern already used by Identity Access (`0007`) and Governance (`0011`/`001-governance-tenant-isolation-tests`). The implementation adds one RLS migration, one Prompt Registry tenant-isolation Vitest file (app-layer + RLS-alone read/write denial per resource type), two small app-layer read helpers needed to exercise `subscriptions` and reuse existing functions elsewhere, and a documented query audit covering features 001/002/003/007.

## Technical Context

**Language/Version**: TypeScript 5.9 on Node.js >=24

**Primary Dependencies**: Drizzle ORM, postgres.js, Vitest, Testcontainers PostgreSQL, shared `withTenantContext()`, shared `assertCrossTenantDenied()`

**Storage**: PostgreSQL; existing `prompt_registry.projects`, `.project_teams`, `.prompts`, `.prompt_versions`, `.subscriptions`, `.project_skill_assignments` tables (all now present as of `0018_prompt_registry_project_teams_and_skill_assignments.sql`)

**Testing**: Vitest integration tests using `startTestDb()` and migrated Testcontainers PostgreSQL

**Target Platform**: Server-side TypeScript bounded-context modules in the Next.js app workspace

**Project Type**: Single Next.js/TypeScript application with bounded-context modules under `src/bcs`

**Performance Goals**: RLS predicates use existing indexed `organization_id` columns (or a single indexed FK join for `prompt_versions`/`project_teams`, which have no direct `organization_id` column) and add no per-row application calls

**Constraints**: Reuse the shared tenant-isolation helper; preserve application-layer `organization_id` filters as the primary control; do not add routes, UI, MCP tools, or entitlement-gated surfaces in this feature; do not restrict subscribe/fork or project-skill assignment *within* an organization (FR-021)

**Scale/Scope**: Six tenant-scoped Prompt Registry tables, one migration, one bounded-context tenant-isolation test file, one query-audit artifact, two small app-layer read helpers

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Test-First Development `[P1]`**: PASS. Tasks require failing Prompt Registry tenant-isolation tests before/alongside the RLS migration.
- **II. Domain-Driven Bounded Contexts `[D1]`**: PASS. Changes stay within `src/bcs/prompt-registry/`, shared database/testing helpers, and Prompt Registry documentation. No cross-BC ORM imports are introduced.
- **III. Domain Invariants Live in Domain Layer `[D2]`**: PASS. This feature adds database isolation and verifies existing service scoping; it does not move domain rules into transport handlers.
- **IV. Multi-Tenant Isolation by Default `[M1-M3]`**: PASS. This feature enables RLS on the five remaining tables and proves cross-tenant read/write denial for all six resource types.
- **V. Secure by Default `[S1-S3]`**: PASS. No secrets, tokens, logging, or template rendering paths are introduced.
- **VI. Auditable & Compliant `[C1-C2]`**: PASS. No new mutation service is added; the audit verifies existing Prompt Registry mutation queries (features 001, 002, 003, 007) stay organization-scoped.
- **VII. Feature-Gated by Entitlement `[G1]`**: PASS. No new REST route, UI surface, or MCP tool is introduced.

## Project Structure

### Documentation (this feature)

```text
specs/022-prompt-registry-tenant-isolation/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── prompt-registry-tenant-isolation.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
drizzle/migrations/
└── 0019_prompt_registry_rls.sql

src/bcs/prompt-registry/
├── application/
│   ├── get-subscription.ts               (new — thin read wrapper, mirrors get-project.ts)
│   ├── query-audit.md                     (new)
│   └── tenant-isolation.test.ts           (new)
└── infrastructure/
    └── schema.ts                          (unchanged — already has all six tables)

src/shared/testing/
└── tenant-isolation.ts                    (reused as-is, not forked)
```

**Structure Decision**: Follow the existing Identity Access / Governance RLS implementation pattern exactly. Add Prompt-Registry-specific tests under the Prompt Registry bounded context and keep the shared helper in `src/shared/testing/tenant-isolation.ts` unchanged unless implementation reveals a genuine gap in its callback contract.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |

## Phase 0: Research

See [research.md](./research.md).

## Phase 1: Design & Contracts

See [data-model.md](./data-model.md), [contracts/prompt-registry-tenant-isolation.md](./contracts/prompt-registry-tenant-isolation.md), and [quickstart.md](./quickstart.md).

## Post-Design Constitution Check

- **P1**: PASS. Tasks include red tests for RLS denial before/alongside the migration.
- **D1/D2**: PASS. Tests and RLS stay within Prompt Registry/shared testing boundaries; service invariants remain in application services.
- **M1-M3**: PASS. RLS policies and cross-tenant denial tests cover all six named tables; the query audit covers application-layer filters across features 001/002/003/007.
- **S1-S3**: PASS. No secret or logging paths change.
- **C1-C2**: PASS. No new mutation path bypasses audit; existing mutation paths are part of the organization-filter audit.
- **G1**: PASS. No user-facing or executable feature surface is introduced.
