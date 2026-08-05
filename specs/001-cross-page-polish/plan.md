# Implementation Plan: Cross-Page Polish & Accessibility

**Branch**: `001-cross-page-polish` | **Date**: 2026-08-04 | **Spec**: `specs/001-cross-page-polish/spec.md`

**Input**: Feature specification from `/specs/001-cross-page-polish/spec.md`

**Note**: This plan scopes the final pass to reusable cross-page affordances and documented verification evidence. It does not redesign owning-epic pages.

## Summary

Standardize the completed go-live UI surfaces around one empty, loading, and error-state presentation model, then verify focus visibility and responsive/theming behavior through targeted component tests and documented manual smoke instructions. The implementation will add a shared app-state component family, document the canonical state patterns in `docs/context/design-system.md`, replace representative page-specific empty/error states in product routes, and preserve existing page layouts and feature behavior.

## Technical Context

**Language/Version**: TypeScript 5.9, React 19, Next.js 16

**Primary Dependencies**: Next.js App Router, Tailwind CSS 4 tokens, existing `@/shared/ui` components, Vitest, `axe-core` for static markup accessibility audits

**Storage**: N/A; UI-only/documentation pass

**Testing**: Vitest component render tests, axe-core static markup audit helper, `pnpm lint`, `pnpm typecheck`, `pnpm test`

**Target Platform**: Browser-rendered open-source/self-hosted SkillCanon app

**Project Type**: Single Next.js web application with bounded-context backend modules in the same repo

**Performance Goals**: State components must avoid layout jumps and add no data fetching or server work

**Constraints**: Preserve owning-epic page designs; no billing UI work; no new backend routes or entitlement gates; global focus styling must remain visible in dark and light token contexts

**Scale/Scope**: In-scope app/auth routes for authentication, teams/settings, projects, prompts, skill-chain detail/run states, metrics, audit log, app shell, and access-denied surfaces

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- P1 Test-First Development: PASS. No backend production logic is introduced. UI behavior changes will be covered by focused Vitest render tests before/with implementation.
- D1/D2/M1/S1/C1/C2: PASS. No bounded-context imports, tenant-scoped persistence, secrets, logging, or audit behavior changes are introduced.
- G1 Feature-Gated by Entitlement: PASS. No new UI surface, route, REST route, or MCP tool is added; existing entitlement checks remain unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/001-cross-page-polish/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── globals.css
│   ├── (app)/
│   │   ├── _components/
│   │   ├── prompts/
│   │   ├── projects/
│   │   ├── teams/
│   │   └── settings/
│   └── (auth)/
├── shared/
│   └── ui/
└── bcs/

docs/context/design-system.md
```

**Structure Decision**: Use the existing single-repo Next.js structure. Shared presentation primitives belong in `src/shared/ui`; route-specific data and workflows remain in `src/app/(app)` or `src/app/(auth)`. The design-system contract is documented in `docs/context/design-system.md`.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |

## Phase 0 Research

See `specs/001-cross-page-polish/research.md`.

## Phase 1 Design

See `specs/001-cross-page-polish/data-model.md`, `specs/001-cross-page-polish/contracts/state-patterns.md`, and `specs/001-cross-page-polish/quickstart.md`.

## Post-Design Constitution Check

- P1: PASS. Tasks include render tests and automated axe-core audits for the shared state component and updated representative pages.
- D1/D2/M1/S1/C1/C2: PASS. Design remains UI-only and does not alter domain, storage, tenancy, secrets, or audit code.
- G1: PASS. Design does not introduce new gated features or routes.
