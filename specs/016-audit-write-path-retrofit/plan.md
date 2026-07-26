# Implementation Plan: Audit Write Path Retrofit, Transport/Source Tracking & Action Vocabulary

**Branch**: `016-audit-write-path-retrofit` | **Date**: 2026-07-26 | **Spec**: `specs/016-audit-write-path-retrofit/spec.md`

**Input**: Feature specification from `/specs/016-audit-write-path-retrofit/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Close the remaining audit coverage gaps for Identity & Access mutations by wrapping organization, team, and user write paths in `withAudit()` and recording exactly one audit event in the same transaction. Extend `audit.audit_events` and `NewAuditEvent` with required `transport` (`web`/`api`/`cli`/`system`) and optional `source_ip`, update all existing `record()` call sites to pass real values, and document the canonical action verb vocabulary plus UI color mapping in the Audit & Compliance contract.

## Technical Context

**Language/Version**: TypeScript 5.9 on Node >=24

**Primary Dependencies**: Next.js 16, Drizzle ORM 0.45, postgres.js, jose, bcryptjs

**Storage**: PostgreSQL 16, Drizzle migrations under `drizzle/migrations`, bounded-context schemas under `src/bcs/*/infrastructure/schema.ts`

**Testing**: Vitest plus Testcontainers-backed Postgres integration tests via `startTestDb()`

**Target Platform**: Server-side Next.js application and shared domain/application modules

**Project Type**: Full-stack TypeScript web application with bounded-context backend modules

**Performance Goals**: Audit inserts remain one in-transaction row write per mutation; `(organization_id, created_at)` index remains available for query/retention scans.

**Constraints**: Audit events are append-only; no application update/delete path for `audit.audit_events`; all secret-bearing `before`/`after` payloads pass through existing redaction before insert; retrofitted mutations must roll back audit rows with the mutation.

**Scale/Scope**: Identity & Access write paths only: organization creation/bootstrap, team creation/update/reparent/insert-between, user create/update/deactivate, plus existing login/logout/invitation/API key audit call sites for the new transport/source fields.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Test-First Development**: New backend behavior starts with failing Vitest/Testcontainers tests for schema fields, `record()` validation/storage, existing call-site transport coverage, and retrofitted write paths. PASS.
- **II. Domain-Driven Bounded Contexts**: Audit schema/type/contract changes stay in `audit-compliance`; Identity & Access services call the public `record()` contract through `withAudit()` rather than importing audit tables directly. PASS.
- **III. Domain Invariants Live in Domain Layer**: No new business invariant is moved into route/UI code; mutation-specific audit shape is built in application services where the write occurs. PASS.
- **IV. Multi-Tenant Isolation by Default**: Existing org-scoped identity tests remain the tenant-isolation signal; this feature does not add a new tenant-scoped table. Audit rows preserve nullable `organization_id` only for already-documented bootstrap/unknown-auth cases. PASS.
- **V. Secure by Default**: Existing redaction remains mandatory and is extended through the new fields without storing raw secrets. Tests continue to assert redaction. PASS.
- **VI. Auditable & Compliant**: This feature directly closes known mutation audit gaps and adds source tracking needed by the audit UI. PASS.
- **VII. Feature-Gated by Entitlement**: No new route, MCP tool, or UI surface is introduced. N/A.

## Project Structure

### Documentation (this feature)

```text
specs/016-audit-write-path-retrofit/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── bcs/
│   ├── audit-compliance/
│   │   ├── CONTRACT.md
│   │   ├── domain/audit-event.ts
│   │   ├── application/record.ts
│   │   ├── application/record.test.ts
│   │   └── infrastructure/schema.ts
│   └── identity-access/
│       ├── application/*.{ts,test.ts}
│       └── infrastructure/schema.ts
├── shared/db/with-audit.ts
└── shared/db/test-helpers.ts

drizzle/migrations/
├── 0004_audit_audit_events.sql
└── 0008_audit_transport_source.sql
```

**Structure Decision**: Use the existing bounded-context layout. Audit owns the event schema, domain type, `record()` contract, and action vocabulary documentation. Identity & Access owns its mutation services and tests, calling Audit only through the public barrel plus shared `withAudit()`.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |
