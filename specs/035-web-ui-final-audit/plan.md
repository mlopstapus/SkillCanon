# Implementation Plan: Web UI Final Composition & Integration Check — Re-Verification

**Branch**: `035-web-ui-final-audit` | **Date**: 2026-08-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/035-web-ui-final-audit/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Re-run the shell-composition audit, legacy-parity audit, and end-to-end smoke test that `specs/001-web-ui-integration-check` (merged 2026-08-03) originally performed, now that both blockers it recorded (no policy/objective UI, no skill-chain UI) have shipped and archived. Per this feature's Clarifications answer, its Definition of Done is that the source backlog item (`008-distribution/003-web-ui-shell-and-core-pages.md`) actually closes — any real gap the re-audit finds gets fixed here, not just filed forward. Phase 0 research below performed the audit itself (the codebase state is the "unknown" this feature resolves, not a technology choice), and found the shell composition, nav model, and legacy parity are already clean; the one substantive correction is to this spec's own initial assumption about chain runs being triggerable from the UI (they deliberately are not, by an already-shipped design decision). No new page-level UI work is required; remaining work is executing the live smoke test and producing the audit artifacts that let the backlog item close.

## Technical Context

**Language/Version**: TypeScript 5, Next.js 16 (App Router), Node.js — matches the rest of the unified `src/` app; no new language/runtime introduced.

**Primary Dependencies**: Existing app stack only (Next.js, Drizzle ORM, the `@/bcs/*` bounded-context barrels). No new dependency required — this feature is verification, not new integration.

**Storage**: PostgreSQL via the existing Docker Compose `database` service (already running, `spechub-database-1`) — used only to run the live smoke test against real data, no schema change.

**Testing**: Manual/live smoke test against a running self-hosted instance (`spechub-app-1`, already up) for the User Story 4 flow; existing Vitest suite re-run as a regression check if any file changes (none currently expected beyond documentation artifacts and, only if the audit surfaces a real gap, a page/component fix following this repo's normal test conventions).

**Target Platform**: Web (the already-deployed self-hosted Next.js app), browser-driven verification via claude-in-chrome.

**Project Type**: Web application (existing unified `src/` Next.js app) — this feature adds no new project, only verification artifacts under its own `specs/035-web-ui-final-audit/` directory and, only if warranted, small fixes inside `src/app`.

**Performance Goals**: N/A — no performance-sensitive code path is touched by an audit/verification feature.

**Constraints**: Must not disrupt the shared long-lived `spechub-app-1`/`spechub-database-1` Docker Compose stack (other concurrent work may depend on it) — verify against it as-is rather than rebuilding, per this repo's own documented convention, unless a real fix requires a rebuild.

**Scale/Scope**: One feature directory's worth of audit documentation (parity matrix, smoke-test record) plus, only if the audit finds a real gap, a narrowly-scoped fix inside `src/app/(app)/**`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle II (Domain-Driven Bounded Contexts)** — N/A for audit work; any fix code (if needed) must still go through each BC's own exported contract (`@/bcs/<name>`), never reach into another BC's internals. No violation anticipated.
- **Principle IV (Multi-Tenant Isolation)** — N/A; no new tenant-scoped table or query is introduced by this feature.
- **Principle VI (Auditable & Compliant)** — N/A; no new mutation path is introduced.
- **Principle VII (Feature-Gated by Entitlement)** — N/A unless a real gap requires new route/UI work, in which case any new capability must gate on an existing entitlement key rather than skip the gate. No new feature surface is currently expected.
- **Principle VIII (Consistent, Accessible UI)** — Directly applicable if FR-008 triggers any real fix: such code must use shared design tokens, `AppState` for empty/loading/error, visible focus states, a shared `src/shared/ui` primitive, mobile-usable layout, and an `axe-core` check (already captured as FR-010 in the spec). Since Phase 0 research below found no page-level gap requiring new UI, this gate is not currently triggered, but stays live for the implementation phase in case one surfaces.
- No other principle is implicated by an audit/verification feature that introduces no new domain logic, no new tenant-scoped data, and (per current research) no new UI surface.

**Result**: PASS — no unjustified violation; Complexity Tracking left empty.

## Project Structure

### Documentation (this feature)

```text
specs/035-web-ui-final-audit/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command) — audit artifacts only, no app schema
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── parity-audit.md       # produced during implementation (tasks.md), not this command
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

No `contracts/` directory — this feature defines no new external interface (REST/CLI/etc.); it
exercises existing ones (`chain-runs` REST endpoints) purely for verification.

### Source Code (repository root)

```text
src/app/(app)/**          # the composed shell + every bounded-context page under audit
src/app/(auth)/**         # auth/onboarding pages under audit
src/app/api/**            # REST routes exercised directly by the smoke test's chain-run step
legacy/frontend/src/app/** # parity-audit source of truth (read-only reference, not modified)
```

**Structure Decision**: No new project or directory structure. This feature operates entirely
within the existing unified `src/app` Next.js application already established by
`004-app-shell-and-landing` and each owning bounded context's own views-UI feature. Its own
output lives under `specs/035-web-ui-final-audit/` (this plan, research, data model, quickstart,
tasks) plus, only if Phase 0/implementation surfaces a real gap, a narrowly-scoped change inside
`src/app/(app)/**` following the existing page/drawer conventions already used by every sibling
feature (`teams/[teamId]/policies`, `prompts/[name]`, etc.).

## Complexity Tracking

No Constitution Check violations — table intentionally empty.
