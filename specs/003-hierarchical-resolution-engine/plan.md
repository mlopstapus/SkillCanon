# Implementation Plan: Hierarchical Resolution Engine

**Branch**: `003-hierarchical-resolution-engine` | **Date**: 2026-07-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-hierarchical-resolution-engine/spec.md`

## Summary

Port the legacy Python Governance resolution behavior into the TypeScript bounded context by adding read-fresh application services for effective policy sets, merged policy ordering, effective objective sets, flat objective titles, and local policy/objective counts. The implementation will reuse Identity Access `getTeamChain` and existing Governance repository reads, add only missing read helpers, and prove parity with characterization fixtures derived from `legacy/backend/src/spechub_server/services/policy_service.py` and `objective_service.py`.

## Technical Context

**Language/Version**: TypeScript 5.9 on Node.js >=24.0.0

**Primary Dependencies**: Next.js 16 app structure, Drizzle ORM 0.45, postgres.js, existing bounded-context modules under `src/bcs`, Identity Access `getTeamChain`

**Storage**: PostgreSQL through Drizzle schemas in `src/bcs/governance/infrastructure/schema.ts` and `src/bcs/identity-access/infrastructure/schema.ts`

**Testing**: Vitest 4 with Testcontainers PostgreSQL via `src/shared/db/test-helpers.ts`

**Target Platform**: Server-side application services consumed by Prompt Registry, Distribution, and future Governance UI/API surfaces

**Project Type**: Next.js/TypeScript monolith with bounded-context library modules

**Performance Goals**: Preserve correctness over caching; one fresh team-chain read plus scoped active policy/objective reads per resolver call is acceptable for this feature

**Constraints**: No resolver caching or memoization; every query must be organization-scoped; no direct Identity Access infrastructure imports from Governance; characterization tests must encode legacy observable behavior before completion

**Scale/Scope**: One Governance application feature spanning policy resolution, objective resolution, and local-count read operations; no route, UI, or entitlement-gated surface is added in this feature

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **P1 Test-First Development**: PASS. Tasks require characterization tests before resolver implementation.
- **D1 Bounded Contexts**: PASS. Governance consumes Identity Access through exported `getTeamChain`; it does not import Identity infrastructure or schema.
- **D2 Domain Invariants**: PASS. Resolution classification and merge invariants live in Governance application/domain types, not routes.
- **M1-M3 Tenant Isolation**: PASS. Every Governance repository read remains scoped by `organizationId`; tests include cross-organization denial/no-leak fixtures.
- **S1-S3 Secure by Default**: PASS. No secrets, auth tokens, template rendering, or logging changes are introduced.
- **C1-C2 Auditable & Compliant**: PASS. This feature is read-only and adds no mutation audit obligation; cross-tenant-sensitive reads are covered by tenant isolation tests.
- **G1 Feature-Gated by Entitlement**: PASS. No UI surface, route, or MCP tool is introduced, so no entitlement gate is required in this feature.

## Project Structure

### Documentation (this feature)

```text
specs/003-hierarchical-resolution-engine/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── governance-resolution.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
src/bcs/governance/
├── application/
│   ├── resolve-effective-policies.ts
│   ├── resolve-effective-policies.test.ts
│   ├── resolve-all-policies.ts
│   ├── resolve-effective-objectives.ts
│   ├── resolve-effective-objectives.test.ts
│   ├── resolve-all-objectives.ts
│   ├── count-local-policies-and-objectives.ts
│   └── count-local-policies-and-objectives.test.ts
├── domain/
│   ├── policy.ts
│   └── objective.ts
├── infrastructure/
│   ├── policies-repo.ts
│   └── objectives-repo.ts
└── index.ts
```

**Structure Decision**: Add application-level read services and small repository helpers inside the existing `src/bcs/governance` bounded context. Use existing domain files for exported effective item/set types where needed. Keep all tests adjacent to the application services, matching existing Governance CRUD tests.

## Complexity Tracking

No constitution violations or complexity exceptions are required.

## Phase 0 Research

Completed in [research.md](./research.md). Key decisions: reuse `getTeamChain`, preserve legacy layer ordering exactly, add fresh Drizzle read helpers, and use TypeScript characterization fixtures that encode expected legacy outputs from the checked-in Python resolver source.

## Phase 1 Design

Completed in [data-model.md](./data-model.md), [contracts/governance-resolution.md](./contracts/governance-resolution.md), and [quickstart.md](./quickstart.md). The local Speckit install has no `.specify/scripts/bash/update-agent-context.sh`, so no agent context update script was available to run.

## Post-Design Constitution Check

- **P1** remains PASS because tasks require red tests before production resolver code.
- **D1/D2** remain PASS because the design keeps resolver orchestration in Governance application services and consumes Identity Access through exports.
- **M1-M3** remain PASS because all data reads are org-scoped and tenant-isolation tests are explicit.
- **S1-S3/C1-C2/G1** remain PASS because the feature remains read-only, route-free, UI-free, and secret-free.
