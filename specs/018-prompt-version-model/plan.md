# Implementation Plan: Prompt & Version Model

**Branch**: `018-prompt-version-model` | **Date**: 2026-07-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/018-prompt-version-model/spec.md`

## Summary

Port `Prompt` and `PromptVersion` from the legacy Python `models.py`/`prompt_service.py` into the TypeScript `prompt-registry` bounded context following the established bounded-context pattern (domain → infrastructure → application). Corrects name uniqueness from globally-unique to organization-scoped. Enforces `PromptVersion` immutability by providing no update path in the application service. Writes `PromptCreated` and `PromptVersionPublished` audit events through the existing `withAudit` helper, following the identical pattern used by `createProject`.

## Technical Context

**Language/Version**: TypeScript 5.x (same as rest of codebase, Node.js 20)

**Primary Dependencies**: Drizzle ORM (postgres-js), Vitest, `@/shared/db` helpers (`id`, `organizationId`, `timestamps`, `withAudit`, `withTenantContext`), `@/bcs/audit-compliance` (`record`, `DEFAULT_WEB_AUDIT_CONTEXT`)

**Storage**: PostgreSQL — `prompt_registry` schema (already exists), two new tables: `prompts` and `prompt_versions`

**Testing**: Vitest with integration tests against a real test database (same pattern as `create-project.test.ts`)

**Target Platform**: Linux server (Next.js API / service layer)

**Project Type**: Service library (no HTTP routes in this feature — application service functions only)

**Performance Goals**: Same as existing project services; no additional latency targets for this feature

**Constraints**: PromptVersion rows MUST be immutable after creation — the application service layer must have no `updateVersion` function. Rollback only changes `active_version_id` on the prompt row. Must not cross bounded-context boundaries (no direct imports from `identity-access` internals).

**Scale/Scope**: Same organization scale as existing project tables

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| P1 — Test-First Development | ✅ PASS | Integration tests written alongside each application function; negative cross-org tests included |
| D1 — Domain-Driven Bounded Contexts | ✅ PASS | All code lives in `src/bcs/prompt-registry/`; Identity/Access consumed only through `ProjectIdentityVerifier`-style interface (no internal imports) |
| D2 — Domain Invariants in Domain Layer | ✅ PASS | Errors, types, and immutability rule declared in `domain/prompt.ts`; services enforce |
| M1/M2/M3 — Multi-Tenant Isolation | ✅ PASS | Every query scoped by `organizationId`; negative cross-org test per resource type; `withTenantContext` used for all queries |
| S1/S2/S3 — Secure by Default | ✅ PASS | No secrets involved; template content not rendered in this feature |
| C1/C2 — Auditable (SOC2) | ✅ PASS | `PromptCreated` and `PromptVersionPublished` events written via `withAudit` |

## Project Structure

### Documentation (this feature)

```text
specs/018-prompt-version-model/
├── plan.md          ← this file
├── research.md      ← Phase 0 output
├── data-model.md    ← Phase 1 output
├── tasks.md         ← Phase 2 output
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
src/bcs/prompt-registry/
├── domain/
│   ├── project.ts                       (existing)
│   └── prompt.ts                        ← NEW: types, errors, interfaces
├── infrastructure/
│   ├── schema.ts                        ← EXTEND: add prompts + prompt_versions tables
│   ├── projects-repo.ts                 (existing)
│   ├── project-members-repo.ts          (existing)
│   ├── prompts-repo.ts                  ← NEW: prompt table queries
│   └── prompt-versions-repo.ts          ← NEW: prompt_version table queries
├── application/
│   ├── create-prompt.ts                 ← NEW
│   ├── create-prompt.test.ts            ← NEW
│   ├── publish-version.ts               ← NEW
│   ├── publish-version.test.ts          ← NEW
│   ├── get-prompt.ts                    ← NEW
│   ├── get-prompt.test.ts               ← NEW
│   ├── list-prompts.ts                  ← NEW
│   ├── list-prompts.test.ts             ← NEW
│   ├── deprecate-prompt.ts              ← NEW
│   ├── deprecate-prompt.test.ts         ← NEW
│   ├── list-versions.ts                 ← NEW
│   ├── list-versions.test.ts            ← NEW
│   ├── rollback-prompt.ts               ← NEW
│   ├── rollback-prompt.test.ts          ← NEW
│   ├── prompt-test-helpers.ts           ← NEW: shared test fixtures
│   └── prompt-characterization.test.ts  ← NEW: immutability characterization test
├── index.ts                             ← EXTEND: re-export new public API
└── CONTRACT.md                          (existing, already documents createPrompt etc.)
```

**Structure Decision**: Follows the existing `project` pattern 1:1 — `domain/` for types and errors, `infrastructure/` for table definitions and raw queries, `application/` for business logic and tests.

## Complexity Tracking

No constitution violations.
