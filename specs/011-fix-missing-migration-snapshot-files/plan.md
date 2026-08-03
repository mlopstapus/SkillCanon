# Implementation Plan: Fix Missing Migration Snapshot Files

**Branch**: `011-fix-missing-migration-snapshot-files` | **Date**: 2026-08-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-fix-missing-migration-snapshot-files/spec.md`

## Summary

Restore the missing Drizzle migration snapshot metadata for historical migrations whose SQL files are already present and applied. The implementation will preserve all existing SQL migrations and journal ordering, reconstruct the missing schema snapshots in migration order for `0007`, `0008`, `0010`, `0011`, `0012`, and `0013`, record provenance for each repaired migration, and verify that future `pnpm db:generate` output no longer includes already-applied historical DDL.

## Technical Context

**Language/Version**: TypeScript 5.9 on Node.js >=24

**Primary Dependencies**: Next.js 16 app workspace, Drizzle ORM, drizzle-kit, PostgreSQL dialect migration metadata

**Storage**: PostgreSQL schema represented by Drizzle SQL migrations and `drizzle/migrations/meta/*_snapshot.json`

**Testing**: Repository file parity checks, `pnpm db:generate`, and a temporary schema-change generation smoke test that is reverted before handoff

**Target Platform**: Development-time migration tooling in the SkillCanon Next.js repository

**Project Type**: Single Next.js/TypeScript application with Drizzle schemas under `src/shared/db` and `src/bcs/*/infrastructure`

**Performance Goals**: Migration generation should diff against the latest complete snapshot state and emit only the intentional schema delta

**Constraints**: Do not modify historical SQL migration bodies or `drizzle/migrations/meta/_journal.json`; do not commit temporary schema edits or generated verification migrations; keep snapshot numbering aligned to SQL migration prefixes

**Scale/Scope**: Six restored snapshot metadata files for existing migrations `0007`, `0008`, `0010`, `0011`, `0012`, and `0013`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Test-First Development `[P1]`**: PASS with scope note. This is migration metadata repair, not new backend production logic; validation is file parity plus migration-generation behavior rather than new service tests.
- **II. Domain-Driven Bounded Contexts `[D1]`**: PASS. No bounded-context service code changes are planned.
- **III. Domain Invariants Live in Domain Layer `[D2]`**: PASS. No domain invariant changes are planned.
- **IV. Multi-Tenant Isolation by Default `[M1-M3]`**: PASS. Existing tenant-scoped SQL is preserved exactly; no new table or query is introduced.
- **V. Secure by Default `[S1-S3]`**: PASS. No secrets, logging, or template rendering paths are touched.
- **VI. Auditable & Compliant `[C1-C2]`**: PASS. No runtime mutation/read path is introduced; historical audit-related migrations are preserved unchanged.
- **VII. Feature-Gated by Entitlement `[G1]`**: PASS. No UI, REST route, or MCP tool is introduced.

## Project Structure

### Documentation (this feature)

```text
specs/011-fix-missing-migration-snapshot-files/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── no-api.md
└── tasks.md
```

### Source Code (repository root)

```text
drizzle/migrations/
├── 0007_identity_access_rls.sql
├── 0008_audit_transport_source.sql
├── 0010_governance_objectives.sql
├── 0011_governance_rls.sql
├── 0012_prompt_registry_projects.sql
├── 0013_prompt_registry_prompts.sql
└── meta/
    ├── 0007_snapshot.json
    ├── 0008_snapshot.json
    ├── 0010_snapshot.json
    ├── 0011_snapshot.json
    ├── 0012_snapshot.json
    └── 0013_snapshot.json
```

**Structure Decision**: Limit implementation to Drizzle migration metadata and feature documentation. The migration SQL files, current Drizzle schema source, and migration journal remain unchanged.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |

## Phase 0: Research

See [research.md](./research.md).

## Phase 1: Design & Contracts

See [data-model.md](./data-model.md), [contracts/no-api.md](./contracts/no-api.md), and [quickstart.md](./quickstart.md).

## Post-Design Constitution Check

- **P1**: PASS. The feature has no new backend logic; tasks include parity and generation checks.
- **D1/D2**: PASS. No bounded-context or domain code is changed.
- **M1-M3**: PASS. Existing RLS and tenant-scoped SQL migrations are restored only through matching metadata.
- **S1-S3**: PASS. No secret-handling or logging code is changed.
- **C1-C2**: PASS. Historical audit migration SQL remains unchanged.
- **G1**: PASS. No new feature surface is introduced.
