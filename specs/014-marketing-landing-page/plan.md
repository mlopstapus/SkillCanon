# Implementation Plan: Marketing Landing Page

**Branch**: `014-marketing-landing-page` | **Date**: 2026-07-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/014-marketing-landing-page/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Replace the placeholder scaffold at the site's root route (`src/app/page.tsx`) with
the real, public, unauthenticated marketing homepage ported from `SkillCanon
Landing.dc.html`. The page is a Next.js Server Component tree for its ten static
sections (hero, trust strip, how-it-works, governance, features, integrations,
compliance callout, final CTA, footer, nav shell), with three small Client
Component "islands" for the only stateful interactions: a theme toggle
(persisted to `localStorage`, applied via a `data-theme` attribute scoped to the
marketing subtree only), a hero visual panel toggle (skills list vs. dependency
graph), and an integrations code-sample tab switcher. Each island's state logic
is extracted into a plain, DOM-free module (mirroring this repo's existing
`nav-model.ts` pattern) so it is unit-testable under Vitest without adding a new
DOM-simulation dependency. Baseline SEO/social metadata is added via Next.js's
file-based `Metadata`/`icon`/`opengraph-image` conventions. No database, bounded
context, or auth-gating change is required — the root route already sits outside
`src/proxy.ts`'s protected matcher.

## Technical Context

**Language/Version**: TypeScript 5.9 on Node.js 24; React 19.2

**Primary Dependencies**: Next.js 16.2 App Router (Server Components + file-based
Metadata/icon/opengraph-image conventions), Tailwind CSS 4.3 (existing design
tokens in `src/app/globals.css` / `docs/context/design-system.md`), `clsx`; no
new runtime dependency required

**Storage**: N/A — no database access; the only persisted state is the visitor's
theme preference in browser `localStorage`

**Testing**: Vitest 4.1. Pure logic modules (theme storage helpers, hero-panel
and integration-tab state, nav/section link tables) get direct unit tests.
Server-rendered structure (section presence, ids, hrefs, ARIA/initial-state
attributes) is verified via `renderToStaticMarkup`, matching this repo's
existing `app-navigation.test.tsx`/`app-shell.test.tsx` convention. This repo
has no jsdom/`@testing-library` dependency today, so simulated click/interaction
behavior and the visual/animation comparison against the mockup are verified by
running the dev server in a real browser (per quickstart.md), not by adding new
test infrastructure for this one feature.

**Target Platform**: Modern browsers served by the unified Next.js application
(the same `app` Docker Compose service); no new deployment surface

**Project Type**: Full-stack web application (Next.js App Router modular
monolith) — this feature only touches `src/app`, no `src/bcs/*` bounded context

**Performance Goals**: No layout shift from font loading (already handled by
existing `next/font/google` setup); scroll-reveal animations must never block
first paint of content (safety-net timer + `prefers-reduced-motion` bypass, per
spec Edge Cases)

**Constraints**: Root route MUST NOT gain any session/auth check (FR-002); the
`[data-theme="light"]` CSS override MUST stay scoped to the marketing subtree
and MUST NOT be reachable from any `(app)` route (per `archive/001-design-
tokens-and-theming.md`'s resolved scoping); external links MUST use
`rel="noopener"` and open in a new tab; GitHub/Docs links point at the real
repo (`github.com/mlopstapus/SkillCanon`), not the mockup's fictional org

**Scale/Scope**: One route (`/`), ten static sections, three interactive
islands, one persisted client-side preference, no new database table, no new
bounded context

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **I. Test-First Development** — PASS. Every pure logic module (theme storage,
  panel/tab state, link tables) gets a failing unit test before implementation;
  every static section component gets a failing `renderToStaticMarkup`
  assertion before its content is filled in.
- **II. Domain-Driven Bounded Contexts** — PASS (N/A). No `src/bcs/*` code is
  added or imported; this feature is presentational-only inside `src/app`.
- **III. Domain Invariants Live in the Domain Layer** — PASS (N/A). No business
  rule/domain model is introduced.
- **IV. Multi-Tenant Isolation by Default** — PASS (N/A). The page is
  intentionally pre-tenant: no tenant-scoped table, query, or session context is
  touched, and none should be — this is the one surface in the product that by
  design has no organization to isolate.
- **V. Secure by Default** — PASS. No secret or credential is touched; external
  links use `rel="noopener"`; no new log statement is added.
- **VI. Auditable & Compliant (SOC2)** — PASS (N/A for mutations). No mutation
  occurs. FR-014 specifically constrains the compliance-callout copy so the page
  never overstates the product's actual (in-scope, not-yet-certified) SOC2/NIST
  status.
- **VII. Feature-Gated by Entitlement** — **Exception, justified** (see
  Complexity Tracking). Entitlement resolution (`resolveEntitlements`) requires
  a resolved org/tenant; an unauthenticated visitor on the public marketing page
  has none. Gating is inapplicable pre-auth, the same reasoning already
  established for pre-auth Identity & Access functions like `login`/
  `authenticateSession` (`bcs/identity-access/CONTRACT.md`), which explicitly
  operate with "no organization context yet."

**Post-design re-check**: PASS. Phase 1 design (below) adds no database entity,
mutation, bounded-context import, or auth-gated path — the exception above is
unchanged by design details.

## Project Structure

### Documentation (this feature)

```text
specs/014-marketing-landing-page/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/
│   └── marketing-page-ui.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
└── app/
    ├── page.tsx                              # root route — replaces placeholder scaffold
    ├── icon.tsx                               # favicon (Next.js Metadata icon convention)
    ├── opengraph-image.tsx                    # OG/Twitter share image (Metadata convention)
    ├── layout.tsx                             # unchanged (fonts, existing metadata baseline)
    └── _components/
        └── marketing/
            ├── marketing-shell.tsx             # server: theme-scoped wrapper + FOUC-prevention script
            ├── marketing-nav.tsx              # server: static links
            ├── marketing-nav.test.tsx          # renderToStaticMarkup structural coverage
            ├── theme-toggle.tsx                # client island
            ├── theme.ts                        # pure: storage key, read/apply/toggle
            ├── theme.test.ts
            ├── hero.tsx                        # server: copy, CTAs, trust line
            ├── hero-panel.tsx                  # client island: skills/graph toggle
            ├── hero-panel.test.ts              # pure state-transition tests
            ├── trust-strip.tsx                 # server
            ├── how-it-works.tsx                # server
            ├── governance.tsx                  # server
            ├── features.tsx                    # server
            ├── integrations.tsx                # server: layout + checklist
            ├── integration-tabs.tsx            # client island: cli/skill/curl toggle
            ├── integration-tabs.test.ts        # pure state-transition tests
            ├── compliance-cta.tsx              # server
            ├── final-cta.tsx                   # server
            ├── footer.tsx                      # server
            ├── reveal.tsx                       # client island: scroll-reveal wrapper
            ├── sections.ts                      # pure: nav-anchor/section id table
            ├── sections.test.ts
            └── marketing-page.test.tsx          # renderToStaticMarkup structural coverage
```

**Structure Decision**: Keep the whole feature inside `src/app`, matching this
codebase's established rule that presentational, non-bounded-context UI stays
under `src/app` and never introduces a `src/bcs/*` dependency. Route-group the
page's subcomponents under `src/app/_components/marketing/` (mirroring the
existing `(app)/_components/` convention) rather than a `(marketing)` route
group, since this feature owns exactly one route (`/`) and a route group would
add no organizational value for a single page. Extract every piece of stateful
logic into a co-located, DOM-free module with its own unit test (the
`nav-model.ts` pattern already used by `013-app-shell-navigation`), keeping
Client Components themselves as thin as possible.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| G1 (Feature-Gated by Entitlement) not applied to this route | The public marketing page renders for visitors with no session and no resolved organization; `resolveEntitlements()` has no tenant to resolve against | Calling the entitlement facade with a fabricated/default org would be meaningless (no real tenant exists) and would wrongly imply this page has tenant-scoped behavior, which it must never have (FR-002) |
