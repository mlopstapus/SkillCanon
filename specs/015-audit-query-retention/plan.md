# Implementation Plan: Audit Query & Retention

**Branch**: `015-audit-query-retention` | **Date**: 2026-07-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/015-audit-query-retention/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Add the read/export/retention half of the `audit-compliance` bounded context on top of the existing immutable `audit.audit_events` table and `record()` write path. `list()` returns only one organization's currently-retained audit events, supports every filter dimension needed by the future audit-log UI, and returns bounded reverse-chronological pages. `exportAuditEvents()` produces CSV for organizations with the export entitlement, but until epic 009 lands the hardcoded entitlement resolver grants a 7-day retention window and no export access. `pruneAuditEvents()` deletes rows older than the resolved retention cutoff and writes exactly one `audit.pruned` system event in the same transaction as the deletion.

## Technical Context

**Language/Version**: TypeScript 5.9, Node.js 24 (repo-wide, per `package.json`)

**Primary Dependencies**: Drizzle ORM (`drizzle-orm`), `postgres` (postgres-js driver), built-in JavaScript date/string handling. No new runtime dependency.

**Storage**: PostgreSQL, existing `audit.audit_events` table in `src/bcs/audit-compliance/infrastructure/schema.ts`.

**Testing**: Vitest, Testcontainers-backed DB integration tests through `startTestDb()`, plus pure application tests where no DB is needed.

**Target Platform**: Next.js server runtime (Node), self-hosted Docker Compose or managed SaaS.

**Project Type**: Web application repository; this feature is backend/domain only under `src/bcs/audit-compliance`. No route handler, UI page, CLI command, or scheduler runner is added here.

**Performance Goals**: Queries are bounded by default/max page sizes and scoped by the existing `(organization_id, created_at)` index; export streams are out of scope for this launch slice and CSV is generated in memory for the currently-retained result set.

**Constraints**: Never return another organization's events; never return events outside the current retention cutoff; export fails closed until a real entitlement source exists; pruning delete and `audit.pruned` write are transactional; query/export read only already-redacted audit rows and introduce no new secret exposure path.

**Scale/Scope**: ~8 files in `src/bcs/audit-compliance` plus Speckit docs/backlog updates. No schema migration is required because the existing table already stores all fields needed by list/export/prune.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Test-First**: Tests are required before each new application/repo behavior: list filters + tenant isolation, retention cutoff exclusion, pruning delete + self-audit event, and export entitlement rejection. PASS.
- **II. Domain-Driven Bounded Contexts**: New code remains in `audit-compliance` and exposes only through its contract/index. It does not import another BC's ORM models. Actor-display-name search is implemented by calling Identity & Access through its public `listUsers` contract to resolve matching same-org user IDs, then applying those IDs in the audit query. API-key actor display names remain out of scope because no API-key display-name lookup contract exists yet. PASS.
- **III. Domain Invariants in the Domain Layer**: Retention default, export fail-closed default, pagination bounds, and pruning transactional guarantees live in this BC's domain/application code, not in a future route. PASS.
- **IV. Multi-Tenant Isolation by Default**: `audit_events.organization_id` is the tenant key. Every read/delete path filters by `organization_id`; tests include negative cross-org cases. RLS for the audit schema is not added in this feature because the existing audit schema/write-path feature shipped without audit-table RLS and the current backlog item names query/retention behavior, not an RLS rollout. PASS with documented deferral.
- **V. Secure by Default**: This feature never writes secret material and only reads already-redacted `before`/`after` values produced by `record()`. Export includes the same redacted payloads returned by list. PASS.
- **VI. Auditable & Compliant (SOC2)**: The retention job records itself as `audit.pruned`; the delete and record happen in the same transaction. Query/export are sensitive reads and are tenant-scoped by construction and test-covered. PASS.
- **VII. Feature-Gated by Entitlement**: No new route/UI/MCP surface is added. The domain export function is gated through a temporary entitlement resolver that fails closed for all orgs until epic 009 supplies `resolveEntitlements()`. PASS.

*Re-checked after Phase 1 design — no new violations introduced by the repo/application split or CSV-only contract.*

## Project Structure

### Documentation (this feature)

```text
specs/015-audit-query-retention/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── audit-query-retention.md
└── tasks.md
```

### Source Code (repository root)

```text
src/bcs/audit-compliance/
├── domain/
│   └── audit-event.ts                  # Existing AuditEvent/NewAuditEvent plus query/export types and errors
├── application/
│   ├── list.ts                         # listAuditEvents(db, orgId, filters, opts?)
│   ├── list.test.ts
│   ├── export.ts                       # exportAuditEvents(db, orgId, format)
│   ├── export.test.ts
│   ├── prune.ts                        # pruneAuditEvents(db, orgId, now?)
│   └── prune.test.ts
├── infrastructure/
│   ├── audit-events-repo.ts            # Add query/delete/count helpers
│   └── audit-events-repo.test.ts       # Add repo coverage around query/delete primitives
└── index.ts                            # Export listAuditEvents/exportAuditEvents/pruneAuditEvents and public types

src/bcs/audit-compliance/CONTRACT.md    # Fill in concrete signatures/temporary entitlement behavior
backlog/003-audit-compliance/           # Mark source backlog item complete/archive after verification
```

**Structure Decision**: Use the existing `src/bcs/<context>/{domain,application,infrastructure}` layout. Query/delete SQL belongs in the audit repo; retention/export gating and pagination defaults belong in application/domain code. No `src/app/` surface is added because the spec explicitly scopes this to the query/export/pruning service layer consumed by a later UI feature.

## Complexity Tracking

> Documented, justified exceptions from the Constitution Check above — not violations requiring a different approach, but deliberate scope boundaries this feature cannot close alone.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Audit table RLS not introduced here (Principle IV/M2) | The prerequisite audit schema/write-path feature already created `audit.audit_events` without RLS. This issue's source backlog item names list/export/retention behavior, not an audit-schema RLS migration. | Adding ad hoc RLS in this issue would expand scope beyond the planned query/retention slice and risk breaking existing transaction-scoped audit writes from other bounded contexts without a dedicated RLS design/test feature. Application-level tenant scoping is still implemented and tested here. |
