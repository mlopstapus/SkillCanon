# Implementation Plan: Web UI Final Composition & Integration Check

**Branch**: `001-web-ui-integration-check` | **Date**: 2026-08-03 | **Spec**: `specs/001-web-ui-integration-check/spec.md`

**Input**: Feature specification from `/specs/001-web-ui-integration-check/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

This feature is a verification/composition checkpoint, not new product code. It audits the already-built `src/app/(app)` and `src/app/(auth)` route trees against (a) the shared app shell delivered by `004-app-shell-and-landing/002-app-shell-and-navigation.md`, (b) the legacy `legacy/frontend/src/app/*` route tree, and (c) the protected-route/auth-redirect contract, then exercises the team → project → policy → prompt → expansion smoke flow. Two categories of outcome are in scope: (1) composition-wiring fixes (e.g. removing a stale nav entry left over from a retired architecture decision) that touch only the shared shell, and (2) a documented parity/gap audit whose findings for anything beyond wiring are attributed to the owning bounded-context feature per FR-015, not built here.

## Technical Context

**Language/Version**: TypeScript 5.x, Next.js 16 (App Router)

**Primary Dependencies**: Next.js, React, Drizzle ORM, existing `src/bcs/*` bounded-context barrels (identity-access, prompt-registry, governance, billing-entitlements)

**Storage**: PostgreSQL (existing schema; no new tables/migrations expected — this feature audits and composes, it does not add domain state)

**Testing**: Vitest (`pnpm test`, `pnpm vitest run <path>`), `pnpm typecheck`, `pnpm lint`, `pnpm build`

**Target Platform**: Self-hosted web app (Docker Compose), server-rendered Next.js

**Project Type**: Web application — single Next.js app at repo root (`src/app`), no separate frontend/backend split for this feature

**Performance Goals**: N/A — verification checkpoint, no new hot paths

**Constraints**: No new bounded-context pages may be built inside this feature (FR-015); any real gap found is recorded against its owning epic, not implemented here unless it is composition wiring into the shared shell

**Scale/Scope**: Audits ~9 legacy route families against the rebuilt `(app)`/`(auth)` route trees; one smoke-flow session; one protected-route sweep across every authenticated route family

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Test-First)**: N/A for the audit itself (no new backend logic). The one code change in scope (removing the stale `workflows` nav entry) is covered by updating the existing `nav-model.test.ts` fixture in the same change, keeping tests green throughout — consistent with the spirit of red-green-iterate for a small, already-covered surface.
- **Principle II/III (Bounded contexts / domain invariants)**: Not touched — this feature does not add or move domain logic, only reads across BC barrels (identity-access, prompt-registry, governance, billing-entitlements) that already exist, and edits one shared-shell file (`nav-model.ts`) that belongs to `004-app-shell-and-landing`, not a BC.
- **Principle IV (Tenant isolation)**: Not touched — no new tenant-scoped table or query.
- **Principle V (Secure by default)**: Not touched.
- **Principle VI (Auditable/SOC2)**: Not touched — no new mutation path.
- **Principle VII (Feature-gated by entitlement)**: Not touched — no new REST route, MCP tool, or UI surface is being added; the one edit removes a link to a route that doesn't exist and never gets built under that name.
- **Gate result**: PASS. No violations to justify in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/001-web-ui-integration-check/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command) — Key Entities from spec.md, no DB schema
├── quickstart.md        # Phase 1 output (/speckit-plan command) — how to reproduce the audit/smoke test
├── parity-audit.md      # Phase 1 output — the actual legacy-route parity matrix (FR-003/FR-004)
├── contracts/           # Phase 1 output — N/A placeholder (no new REST contracts; existing contracts are audited, not created)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/app/
├── (app)/                         # Shared authenticated shell + composed BC pages (audit target)
│   ├── layout.tsx                 # Single auth/entitlement gate (resolveAppShellAccess) — verified, not duplicated
│   ├── _components/nav-model.ts   # Shared nav model — ONE edit in scope: drop the stale "workflows" entry
│   ├── dashboard/, prompts/, projects/, teams/, settings/api-keys/, settings/audit-log/
├── (auth)/                        # login, register, invite, welcome
├── api/                           # REST routes exercised by the smoke flow
legacy/frontend/src/app/           # Parity-audit source of truth for legacy route families
specs/001-web-ui-integration-check/  # This feature's audit artifacts
```

**Structure Decision**: Single Next.js app at repo root (existing `src/app` structure, Option 1 web-application layout already established by `004-app-shell-and-landing` and per-BC epics). This feature adds no new source directories — it audits the existing tree and makes one small edit inside the already-existing shared shell.

## Complexity Tracking

No constitution violations or complexity exceptions are required for this feature.
