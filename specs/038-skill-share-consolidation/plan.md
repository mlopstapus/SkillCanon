# Implementation Plan: Skill share/project-drawer consolidation

**Branch**: `038-skill-share-consolidation` (spec directory number; actual git branch is `039-consolidate-skill-share-project-drawer`) | **Date**: 2026-08-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/038-skill-share-consolidation/spec.md`

## Summary

Remove the duplicate, confusing per-project enforcement control from the skill detail page (the "Projects" toolbar button and `assign-projects-drawer.tsx`), since that capability already exists correctly on the project detail page's Skills tab and becomes its sole home. Consolidate the skill page down to one sharing mechanism — the existing Share drawer — updating its copy and grant labeling to match the approved design, and add a new "X teams · Y subscribers · Z copies" summary backed by one new read query (skill fork count) plus data already fetched today (subscription count). No database migration; no change to the project-page enforcement UI or its authorization rules.

## Technical Context

**Language/Version**: TypeScript 5.x, Next.js 16 (App Router)

**Primary Dependencies**: React (Server + Client Components), Drizzle ORM, Tailwind v4 (design tokens via `src/app/globals.css`), Vitest + `@testing-library`-style `renderToStaticMarkup` tests, `axe-core` for accessibility checks

**Storage**: PostgreSQL, via the existing `prompt_registry.prompts` (`forked_from_skill_id` column, already present) and `prompt_registry.subscriptions` tables — no schema change

**Testing**: Vitest (`pnpm exec vitest run --fileParallelism=false --testTimeout=30000` for full-suite verification per this repo's documented convention); Testcontainers-backed Postgres for the new repo/application-layer read

**Target Platform**: Web (self-hosted Docker Compose deployment, Next.js `.next/standalone` runtime)

**Project Type**: Web application — unified Next.js app at repo root (`src/`), per `docs/context/repo-structure.md`

**Performance Goals**: N/A — this is a low-traffic internal admin UI change; no new performance requirement beyond "the added fork-count query doesn't materially slow the existing skill-detail page load" (one more parallel query alongside the existing `Promise.all([...])` fetch)

**Constraints**: Must not change project-page enforcement behavior or authorization rules (FR-002, FR-009); must not regress fork/Deprecate/Reactivate/New-version actions (FR-008); no schema migration

**Scale/Scope**: Single bounded context (`prompt-registry`), two route-group pages (`src/app/(app)/prompts/[name]/`, read-only touch to none in `src/app/(app)/projects/[id]/`), one new repo-layer read function

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution (`.specify/memory/constitution.md`) describes the
**previous** Python/FastAPI + SQLAlchemy/Alembic stack (Principles I, III,
IV's "service-layer query" framing, the Technology & Compliance Constraints
section's "Python/FastAPI backend"). That stack was fully ported to the
current unified TypeScript/Next.js/Drizzle app and deleted 2026-08-12 (see
`CLAUDE.md`) — the constitution has not been amended since. Principles are
evaluated below against their **intent**, mapped onto the current stack,
not their literal (stale) wording:

- **I. Test-First Development** — applies in spirit (this repo's actual
  convention per `CLAUDE.md`/`AGENTS.md` is Testcontainers-backed tests for
  new backend reads). The new `countForksOfSkill` read gets a test before/
  alongside implementation. **PASS** (planned in tasks).
- **II. Domain-Driven Bounded Contexts** — the new read lives entirely
  inside the existing `prompt-registry` BC (`infrastructure/prompts-repo.ts`
  + a new `application/count-forks-of-skill.ts`), exported from its barrel,
  documented in its `CONTRACT.md` — no cross-BC coupling introduced.
  **PASS**.
- **III. Domain Invariants Live in the Domain Layer** — N/A: this feature
  adds no new business rule/invariant (it's a pure count read and a UI
  consolidation); the one existing invariant it touches (project-assignment
  eligibility) is explicitly unchanged (FR-009). **PASS (not applicable)**.
- **IV. Multi-Tenant Isolation** — the new `countForksOfSkill` read MUST be
  organization-scoped (`WHERE organization_id = $1 AND forked_from_skill_id
  = $2`), matching every existing prompt-registry read. **PASS (planned)**.
- **V. Secure by Default** — not implicated; no secrets, no template
  rendering involved.
- **VI. Auditable & Compliant** — not implicated; this is a read-only query
  and a UI change, not a mutation. No new audit event needed (removing a UI
  entry point to an already-audited mutation doesn't change what's
  audited).
- **VII. Feature-Gated by Entitlement** — not implicated; this repo's
  actual entitlements system (`billing-entitlements`, per `docs/context/
  entitlements.md`) has no gate on the Share drawer or project-assignment
  UI today, and this feature doesn't add a new capability — it relocates
  and relabels an existing one, and adds a read-only count. No new
  entitlement key needed.
- **VIII. Consistent, Accessible UI** — partially applicable. The Share
  drawer already uses the shared `Drawer` primitive (`@/shared/ui`,
  `role="dialog"`/focus-trap/Escape-to-close) — unchanged by this feature.
  Design tokens (no hardcoded color/spacing literals) — the edits are
  copy/label changes within already-token-based markup, no new literals
  introduced. The constitution's `axe-core` clause is **not met anywhere in
  this codebase today** — confirmed by repo-wide grep, zero test files
  import `axe-core`/`jest-axe`/`toHaveNoViolations`. This is a pre-existing,
  repo-wide gap between the constitution and reality, not something
  introduced or worsened by this feature (deleting
  `assign-projects-drawer.test.tsx` removes zero axe coverage, since it had
  none). Retrofitting axe-core testing infrastructure repo-wide is out of
  scope for a two-drawer consolidation — noted here rather than silently
  ignored, but not undertaken as part of this plan. **PASS (accepted
  pre-existing gap, not a new violation)**.

**Overall**: No violations requiring justification. No Complexity Tracking
entries needed.

**Post-Design Re-check** (after Phase 1 `research.md`/`data-model.md`/
`contracts/`/`quickstart.md`): design confirms every assumption above —
`countForksOfSkill` is org-scoped (IV), lives entirely inside
`prompt-registry` (II), adds no invariant (III), needs no audit write (VI)
or entitlement gate (VII), and the accessibility gap (VIII's axe-core
clause) remains the same pre-existing, unworsened repo-wide condition. No
new violations surfaced during design. Gate remains **PASS**.

## Project Structure

### Documentation (this feature)

```text
specs/038-skill-share-consolidation/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/            # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
src/
├── app/(app)/prompts/[name]/
│   ├── page.tsx                       # loader: remove projectAssignment, add copyCount/subCount fields
│   ├── prompt-detail.tsx              # remove assignOpen state, AssignProjectsDrawer render, onOpenAssignProjects
│   ├── prompt-detail-view.tsx         # remove Projects button + projectAssignment type field; update banner
│   ├── share-drawer.tsx               # update banner copy; normalize Grant/Revoke labels
│   ├── share-drawer.test.tsx          # update for new copy/labels
│   ├── assign-projects-drawer.tsx     # DELETE
│   └── assign-projects-drawer.test.tsx # DELETE
├── app/(app)/projects/[id]/           # UNCHANGED — existing Skills tab already correct
└── bcs/prompt-registry/
    ├── infrastructure/prompts-repo.ts      # add countForksOfSkill
    ├── application/count-forks-of-skill.ts # NEW — thin wrapper, exported from barrel
    ├── application/count-forks-of-skill.test.ts # NEW
    ├── index.ts                            # export countForksOfSkill
    └── CONTRACT.md                         # document the new exposed function
```

**Structure Decision**: Single unified Next.js app (per `docs/context/
repo-structure.md`) — no new top-level directory. Changes are confined to
one route (`src/app/(app)/prompts/[name]/`) and one bounded context
(`src/bcs/prompt-registry/`); the project route (`src/app/(app)/projects/
[id]/`) is read-only-referenced in the spec/plan but requires no code
changes.

## Complexity Tracking

*No violations — table intentionally omitted.*
