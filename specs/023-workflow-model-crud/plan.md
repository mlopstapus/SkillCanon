# Implementation Plan: Workflow Model & CRUD

**Branch**: `023-workflow-model-crud` | **Date**: 2026-07-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/023-workflow-model-crud/spec.md`

## Summary

Port `Workflow` from the legacy Python `models.py`/`workflow_service.py` into the new `workflow-orchestration` bounded context (`src/bcs/workflow-orchestration/`), scoped under `Organization` and optionally a `Project`. Provides `createWorkflow`, `listWorkflows`, and `updateWorkflow` only — no delete, no run, no sharing (separate backlog items). Steps are validated for shape only (unique step id, referenced prompt name, dependency list) and never resolved against Prompt Registry at write time. Authorization for update/list follows the codebase's established self-or-admin default (`revokeApiKey`/`listApiKeys`/`listInvitations` precedent in `identity-access`). Every successful create/update writes an audit event through the existing `withAudit` + `record` path.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js 20), same as rest of the root scaffold

**Primary Dependencies**: Drizzle ORM (postgres-js), Vitest, `@/shared/db` helpers (`id`, `organizationId`, `timestamps`, `withAudit`), `@/bcs/audit-compliance` (`record`, `DEFAULT_WEB_AUDIT_CONTEXT`), `@/bcs/identity-access` (`UserSummary` type only), `@/bcs/prompt-registry` (`getProject` — org-boundary check for FR-003)

**Storage**: PostgreSQL — new `workflow` schema (already declared empty in `src/shared/db/schemas.ts`), one new table: `workflow.workflows`

**Testing**: Vitest with Testcontainers-backed integration tests against a real Postgres (existing repo convention — no mocked DB)

**Target Platform**: Linux server (Next.js API / service layer)

**Project Type**: Service library — application/domain/infrastructure layers only, no HTTP routes (routing is Distribution's epic, per this codebase's established precedent of identity-access epic features never building `src/app/**` routes)

**Performance Goals**: No new latency targets beyond existing org-scoped query patterns

**Constraints**: No delete operation exposed (FR-016). No step-dependency-cycle or prompt-existence validation at write time (FR-006, FR-007 — deferred to the not-yet-built workflow-runner feature). A workflow's `organization_id`, `user_id`, and `project_id` are immutable after creation (FR-013). Must not cross bounded-context boundaries via internal imports — project org-boundary check goes through prompt-registry's exported `getProject`, not a direct schema import.

**Scale/Scope**: Same organization scale as existing org-scoped tables (projects, prompts)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| P1 — Test-First Development | ✅ PASS | Integration tests written alongside each application function; negative cross-org and authorization tests included |
| D1 — Domain-Driven Bounded Contexts | ✅ PASS | All code lives in `src/bcs/workflow-orchestration/`; Prompt Registry consumed only through its exported `getProject`; Identity & Access consumed only through its exported `UserSummary` type — no internal imports of either |
| D2 — Domain Invariants in Domain Layer | ✅ PASS | Step-shape validation, uniqueness, and immutability rules declared in `domain/workflow.ts`; application functions enforce, never re-implemented per call site |
| M1/M2/M3 — Multi-Tenant Isolation | ✅ PASS | Every query scoped by `organizationId`; cross-org project-scoping rejection (FR-003) has a dedicated negative test; RLS is out of scope for this feature (tracked separately, matching `prompt_registry`'s precedent of deferring RLS to its own dedicated feature) |
| S1/S2/S3 — Secure by Default | ✅ PASS | No secrets involved; `steps` jsonb is opaque data, never rendered as a template by this feature |
| C1/C2 — Auditable (SOC2) | ✅ PASS | `workflow.created` / `workflow.updated` audit events written via `withAudit`; rejected attempts never call `withAudit` |

## Project Structure

### Documentation (this feature)

```text
specs/023-workflow-model-crud/
├── plan.md          ← this file
├── research.md      ← Phase 0 output
├── data-model.md    ← Phase 1 output
├── quickstart.md    ← Phase 1 output
├── tasks.md         ← Phase 2 output (speckit-tasks)
└── checklists/
    └── requirements.md   (existing)
```

### Source Code (repository root)

```text
src/bcs/workflow-orchestration/
├── domain/
│   └── workflow.ts                      ← NEW: Workflow/WorkflowStep types, errors, step validation
├── infrastructure/
│   ├── schema.ts                        ← NEW: workflow.workflows table
│   └── workflows-repo.ts                ← NEW: insert / findByOrgAndId / update / listByOrgAndFilters
├── application/
│   ├── create-workflow.ts               ← NEW
│   ├── create-workflow.test.ts          ← NEW
│   ├── list-workflows.ts                ← NEW
│   ├── list-workflows.test.ts           ← NEW
│   ├── update-workflow.ts               ← NEW
│   └── update-workflow.test.ts          ← NEW
├── index.ts                             ← EXTEND: re-export public API (currently `export {}`)
└── CONTRACT.md                          (existing — already documents createWorkflow/updateWorkflow/listWorkflows)
```

**Structure Decision**: Follows the existing `project`/`prompt` bounded-context pattern 1:1 — `domain/` for types, errors, and validation; `infrastructure/` for the Drizzle table and raw queries; `application/` for business logic (authorization, audit, orchestration) plus its integration tests.

## Complexity Tracking

No constitution violations.
