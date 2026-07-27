# Implementation Plan: Project Model & Membership

**Branch**: `agent/planning-agent/67135111` | **Date**: 2026-07-27 | **Spec**: `specs/001-project-model-membership/spec.md`
**Input**: Feature specification from `specs/001-project-model-membership/spec.md`

## Summary

Implement the Prompt Registry project foundation in the existing Next.js/TypeScript bounded-context architecture. The feature adds Drizzle schema and migration coverage for `prompt_registry.projects` and `prompt_registry.project_members`, domain/application/repository APIs for project CRUD and member management, transactional audit events for every successful mutation, and read-contract exports for other bounded contexts.

## Technical Context

**Language/Version**: TypeScript 5.9 on Node.js >=24
**Primary Dependencies**: Next.js 16, Drizzle ORM 0.45, postgres.js, Vitest, Testcontainers PostgreSQL
**Storage**: PostgreSQL schemas managed by Drizzle SQL migrations
**Testing**: Vitest unit/integration tests, Testcontainers-backed database tests
**Target Platform**: Server-side application/domain modules in the existing Next.js app
**Project Type**: Single TypeScript app with bounded contexts under `src/bcs/*`
**Performance Goals**: Project/member list queries use indexed organization/team/project predicates and deterministic ordering
**Constraints**: Prompt Registry must consume Identity & Access through its public read contract only; all successful mutations write exactly one Audit & Compliance event in the same transaction
**Scale/Scope**: Organization-scoped project records and memberships; no UI, authorization policy, prompt CRUD, prompt versions, sharing, or expansion engine work in this feature

## Constitution Check

- **P1 Test-First Development**: PASS. Tasks require failing Vitest coverage before implementation for each story and repository invariant.
- **D1 Bounded Contexts**: PASS. Prompt Registry owns its schema/domain and calls Identity & Access through verifier/read-contract interfaces rather than importing identity tables into application services.
- **D2 Domain Invariants**: PASS. Same-organization and immutability rules live in Prompt Registry domain/application functions, not route handlers.
- **M1-M3 Multi-Tenant Isolation**: PASS. Tables carry `organization_id`, service reads require organization scope, cross-organization negative tests are mandatory, and RLS is included for new tenant-scoped tables.
- **S1-S3 Secure by Default**: PASS. Feature stores no secrets and adds no templating/logging path.
- **C1-C2 Auditable & Compliant**: PASS. Each mutation is wrapped with `withAudit` and calls Audit & Compliance `record()` in the same transaction; failed mutations write no audit rows.
- **G1 Feature-Gated by Entitlement**: N/A. This feature exposes domain/application APIs only, with no new UI surface, REST route, or MCP tool.

## Project Structure

### Documentation

```text
specs/001-project-model-membership/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── prompt-registry-projects.md
└── tasks.md
```

### Source

```text
src/bcs/prompt-registry/
├── CONTRACT.md
├── index.ts
├── domain/
│   └── project.ts
├── application/
│   ├── project-test-helpers.ts
│   ├── create-project.ts
│   ├── create-project.test.ts
│   ├── update-project.ts
│   ├── update-project.test.ts
│   ├── delete-project.ts
│   ├── delete-project.test.ts
│   ├── get-project.ts
│   ├── get-project.test.ts
│   ├── list-projects.ts
│   ├── list-projects.test.ts
│   ├── add-project-member.ts
│   ├── add-project-member.test.ts
│   ├── remove-project-member.ts
│   ├── remove-project-member.test.ts
│   ├── list-project-members.ts
│   └── list-project-members.test.ts
└── infrastructure/
    ├── schema.ts
    ├── projects-repo.ts
    ├── projects-repo.test.ts
    ├── project-members-repo.ts
    └── project-members-repo.test.ts
```

```text
drizzle/migrations/
└── 0012_prompt_registry_projects.sql
```

## Phase 0: Research

Completed in `research.md`.

## Phase 1: Design & Contracts

Completed in:

- `data-model.md`
- `contracts/prompt-registry-projects.md`
- `quickstart.md`

## Phase 2: Task Planning

Generated in `tasks.md`.

## Complexity Tracking

No constitution violations or complexity exceptions.

## Post-Design Constitution Check

PASS. The design keeps Prompt Registry ownership local, uses Identity & Access only through a public-verifier contract, adds organization-scoped indexes and RLS for new tables, and records audit events transactionally for all successful mutations.
