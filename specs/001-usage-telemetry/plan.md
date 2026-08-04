# Implementation Plan: Usage Telemetry

**Branch**: `001-usage-telemetry` | **Date**: 2026-08-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-usage-telemetry/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Extend the existing `distribution.prompt_usage` capability from project fixture telemetry into real Distribution runtime telemetry. Add outcome/latency/git-context columns, record one row for genuine REST expansion and accepted terminal skill-chain step reports, preserve preview/test exclusion, and expose organization-scoped aggregate metrics through `/api/metrics` and an authenticated `/metrics` page.

## Technical Context

**Language/Version**: TypeScript 5.9 on Node.js >=24, Next.js App Router

**Primary Dependencies**: Drizzle ORM/postgres-js, Vitest with Testcontainers, Next.js server routes/pages, existing bounded context barrels (`prompt-registry`, `distribution`, `identity-access`, `billing-entitlements`)

**Storage**: PostgreSQL via Drizzle; additive migration against `distribution.prompt_usage`

**Testing**: Vitest. Testcontainers-backed integration tests for DB/service/API routes; static React rendering tests for the metrics page components where practical.

**Target Platform**: Self-hosted Next.js app and REST API running on Linux/containerized deployments.

**Project Type**: Single TypeScript web application with server-side bounded context modules and App Router API/page surfaces.

**Performance Goals**: Metrics summary queries aggregate within a bounded time window and are scoped by `organization_id`; no new hard latency SLO beyond using indexed organization/time/status/skill access paths.

**Constraints**: Usage writes must not be audit events, preview/test UI expands must remain unrecorded, reads and writes must be organization-scoped at the application layer, and new route/page work must pass the existing `coreFeaturesEnabled` app-shell entitlement gate.

**Scale/Scope**: One existing telemetry table extended, two Distribution application services, REST expand and chain advance wiring, one org-level metrics route, and one authenticated metrics page.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The current codebase is TypeScript/Next.js while the constitution still references the legacy Python/FastAPI stack, but it states the principles apply regardless of implementation language.

- **I. Test-First (P1)**: New backend behavior starts with Vitest coverage: REST expansion writes, preview exclusion, chain terminal-step writes, and org-scoped metrics isolation.
- **II. Bounded Contexts (D1)**: `distribution` owns schema/repository/application telemetry functions. `prompt-registry` remains the supplier of skill/version/run data through its public application exports; route handlers compose at the Distribution boundary.
- **III. Domain Invariants (D2)**: Telemetry normalization (status, latency, optional context) lives in Distribution application helpers, not duplicated in page components.
- **IV. Multi-Tenant Isolation (M1-M3)**: Every write uses `caller.organizationId`; every metrics read filters by `organization_id`. Negative cross-org metrics tests are required. Existing lack of Distribution RLS is documented as an inherited gap from feature 024, not expanded here.
- **V. Secure by Default (S1-S3)**: Telemetry never stores raw prompts, rendered messages, API keys, JWTs, or error details.
- **VI. Audit & Compliance (C1-C2)**: Usage telemetry remains distinct from audit logging. This feature records product observability rows only; chain completion audit events already remain in the prompt-registry path.
- **VII. Entitlements (G1)**: The `/metrics` page is under `src/app/(app)` and therefore behind `resolveAppShellAccess()`/`coreFeaturesEnabled`. The new `/api/metrics` route must explicitly assert `coreFeaturesEnabled` before doing work.

**Result**: PASS. No unresolved clarification or blocking constitution violation.

**Post-design re-check**: Design artifacts keep telemetry in Distribution, keep route/page work behind the app-shell or explicit API gate, and include tests for REST writes, chain writes, preview exclusion, and cross-org metrics isolation. Still PASS.

## Project Structure

### Documentation (this feature)

```text
specs/001-usage-telemetry/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── usage-telemetry.contract.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
src/bcs/distribution/
├── domain/prompt-usage.ts
├── infrastructure/schema.ts
├── infrastructure/prompt-usage-repo.ts
├── application/record-prompt-usage.ts
├── application/record-prompt-usage.test.ts
├── application/get-prompt-usage-summary-for-organization.ts
├── application/get-prompt-usage-summary-for-organization.test.ts
└── index.ts

src/app/api/
├── skills/[name]/expand/route.ts
├── skills/[name]/expand/route.test.ts
├── chain-runs/[runId]/advance/route.ts
├── chain-runs/[runId]/advance/route.test.ts
└── metrics/
    ├── route.ts
    └── route.test.ts

src/app/(app)/metrics/
├── page.tsx
└── metrics-page.test.tsx

drizzle/migrations/
└── 0025_distribution_usage_telemetry.sql
```

**Structure Decision**: Single unified Next.js app. Telemetry storage/query code remains in Distribution. REST handlers in `src/app/api/**` are Distribution-owned composition roots. The metrics page is an app-shell surface fed by the Distribution organization summary, with display names joined from prompt-registry application reads where needed.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No constitution violations. Two inherited implementation notes are tracked explicitly:

| Note | Why It Exists | Follow-up |
|------|---------------|-----------|
| `distribution.prompt_usage` still has no Postgres RLS | Feature 024 shipped application-layer scoping only; this feature adds columns and indexes without changing the tenant-isolation architecture midstream | Epic 008 distribution tenant-isolation work should add RLS for the table |
| MCP parity remains deferred | The spec explicitly deprioritizes MCP parity until the MCP `sh-run` transport is revisited | Keep contract text stating equivalent semantics are required when MCP parity is implemented |
