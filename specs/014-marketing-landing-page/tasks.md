# Tasks: Marketing Landing Page

**Input**: Design documents from `/specs/014-marketing-landing-page/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/marketing-page-ui.md, quickstart.md

**Tests**: Required by the specification's independent-test scenarios and
Constitution Principle I. Every DOM-free logic module and every server-rendered
content section gets a failing test before its implementation, per plan.md's
Testing approach (no jsdom in this repo — interaction/visual checks are manual,
tracked as explicit quickstart.md-referencing tasks).

**Organization**: Tasks are grouped by user story (spec.md's four stories) so
content, nav wayfinding, theming, and interactive demos can each be validated
as an incremental slice.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it touches a different file and does not
  depend on an incomplete task in the same phase.
- **[Story]**: Maps to User Story 1-4 in spec.md.
- Every task names its target file path.

---

## Phase 1: Setup

**Purpose**: Groundwork shared by every story — no new dependency required
(per research.md).

- [X] T001 [P] Add `html { scroll-behavior: smooth; }` to `src/app/globals.css` so in-page anchor links scroll smoothly (needed by US2, harmless on every route)
- [X] T002 [P] Add a regression-guard test in `src/proxy.test.ts` asserting `config.matcher` excludes `"/"`, so the homepage (FR-002) can never be accidentally auth-gated by a future change
- [X] T003 [P] Create `src/app/_components/marketing/sections.ts` + `sections.test.ts`: the nav/section anchor table (id, nav label, href/kind) from contracts/marketing-page-ui.md's Nav and Section contracts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shell scaffolding every user story composes into.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 [P] Create `src/app/_components/marketing/theme.ts` + `theme.test.ts`: `THEME_STORAGE_KEY`, `readStoredTheme(storage)`, `otherTheme(theme)`, and `themeInitScript()` (returns the FOUC-prevention inline script source per research.md's Theme persistence decision)
- [X] T005 Create `src/app/_components/marketing/marketing-shell.tsx`: Server Component rendering the `#marketing-root` wrapper div (ambient background/grid layers from the mockup) plus the blocking inline script from T004's `themeInitScript()` — depends on T004
- [X] T006 Replace the placeholder scaffold in `src/app/page.tsx` with `<MarketingShell>` and a baseline `export const metadata` (title/description only — full Open Graph/Twitter contract completed in Polish) — depends on T005

**Checkpoint**: shell scaffolding renders (no section content yet); user story phases fill it in.

---

## Phase 3: User Story 1 - Evaluate the product from the homepage (Priority: P1) 🎯 MVP

**Goal**: Every section from the source design renders with real content.

**Independent Test**: Load `/` unauthenticated; hero, trust strip, how-it-works,
governance, features, integrations, compliance, final CTA, and footer are all
present with real (non-placeholder) copy.

### Tests for User Story 1

> Write this test first and confirm it fails before implementation.

- [X] T007 [US1] Write failing `src/app/_components/marketing/marketing-page.test.tsx`: `renderToStaticMarkup` assertions for hero headline/subhead/CTA copy, trust-strip agent list, how-it-works's 4 steps, governance heading + policy-resolution example, 6 feature cards, integrations checklist + default "cli" code sample, compliance stat tiles using FR-014's softened wording, final CTA copy, and footer links — content sourced from `SkillCanon Landing.dc.html` per contracts/marketing-page-ui.md's Section contract

### Implementation for User Story 1

- [X] T008 [P] [US1] Implement `src/app/_components/marketing/hero.tsx`: headline, subhead, CTA buttons linking to `#quickstart` ("Deploy in 2 minutes", per FR-012) and `#how` ("See how it works"), trust line, and the default ("skills") hero visual content
- [X] T009 [P] [US1] Implement `src/app/_components/marketing/trust-strip.tsx`
- [X] T010 [P] [US1] Implement `src/app/_components/marketing/how-it-works.tsx` (`id="how"`, 4-step flow: Define, Govern, Distribute, Expand)
- [X] T011 [P] [US1] Implement `src/app/_components/marketing/governance.tsx` (`id="governance"`, inheritance description + policy-resolution example)
- [X] T012 [P] [US1] Implement `src/app/_components/marketing/features.tsx` (`id="features"`, 6 feature cards)
- [X] T013 [P] [US1] Implement `src/app/_components/marketing/integrations.tsx` (`id="integrations"`, checklist + default "cli" code sample rendered; `id="quickstart"` on its heading)
- [X] T014 [P] [US1] Implement `src/app/_components/marketing/compliance-cta.tsx` (SOC2/NIST/self-hosted/no-LLM-calls stat tiles using FR-014's softened wording)
- [X] T015 [P] [US1] Implement `src/app/_components/marketing/final-cta.tsx`, whose "Deploy SkillCanon" CTA links to `#quickstart` per FR-012
- [X] T016 [P] [US1] Implement `src/app/_components/marketing/footer.tsx` (logo, license, Docs/GitHub/API reference/Architecture links)
- [X] T017 [US1] Compose all US1 sections into `src/app/page.tsx`, nested inside the `<MarketingShell>` wrapper from T005, in source-design order — depends on T008-T016
- [X] T018 [US1] Run `pnpm vitest run src/app/_components/marketing` and confirm T007's test passes

**Checkpoint**: homepage renders full real content end to end (MVP, though nav/theme/interactivity land in later phases).

---

## Phase 4: User Story 2 - Jump to a section via the nav (Priority: P1)

**Goal**: The nav's anchor and external links work correctly.

**Independent Test**: Click each nav link in isolation; the viewport scrolls to
the matching section, and Docs/GitHub open the real repo in a new tab.

### Tests for User Story 2

- [X] T019 [US2] Write failing `src/app/_components/marketing/marketing-nav.test.tsx`: `renderToStaticMarkup` assertions for all 5 anchor hrefs (`#how`, `#governance`, `#features`, `#integrations`, `#quickstart`), Docs/GitHub hrefs pointing at `https://github.com/mlopstapus/SkillCanon` (and its `docs/` dir), and `target="_blank" rel="noopener"` on both external links

### Implementation for User Story 2

- [X] T020 [US2] Implement `src/app/_components/marketing/marketing-nav.tsx`: logo (`#top`), the 5 anchor links from T003's `sections.ts`, Docs/GitHub external links, primary CTA (`#quickstart`), and a placeholder (not-yet-wired) theme-toggle button — depends on T003
- [X] T021 [US2] Compose `<MarketingNav />` at the top of `src/app/page.tsx` — depends on T017, T020
- [X] T022 [US2] Manual check: quickstart.md steps 2-3 (nav anchors scroll, direct `/#fragment` links land pre-scrolled, external links open in a new tab)

**Checkpoint**: nav wayfinding fully functional.

---

## Phase 5: User Story 3 - Switch between light and dark theme (Priority: P2)

**Goal**: The theme toggle works and persists.

**Independent Test**: Toggle the theme; every section switches together; reload
the page and the choice persists.

### Tests for User Story 3

- [X] T023 [P] [US3] Extend `theme.test.ts` (from T004) with full default/read/write/toggle coverage: defaults to `"dark"` with no stored value, `otherTheme` flips both directions, storage round-trips correctly

### Implementation for User Story 3

- [X] T024 [US3] Implement `src/app/_components/marketing/theme-toggle.tsx`: client island using T004's helpers to read/write `localStorage` and toggle the `data-theme` attribute on `#marketing-root` — depends on T004, T005
- [X] T025 [US3] Replace the placeholder toggle button in `marketing-nav.tsx` with `<ThemeToggle />` — depends on T020, T024
- [X] T026 [US3] Manual check: quickstart.md step 4 (toggle switches every section together, persists across reload via `localStorage`)

**Checkpoint**: theme toggle fully functional and persistent.

---

## Phase 6: User Story 4 - Explore interactive hero and integration demos (Priority: P3)

**Goal**: The hero panel toggle and integration tabs work.

**Independent Test**: Toggle each control independently; the corresponding
panel/tab swaps content while the other stays inert.

### Tests for User Story 4

- [X] T027 [P] [US4] Write failing `src/app/_components/marketing/hero-panel.test.ts`: pure state module — default `"skills"`, toggling flips to `"graph"` and back
- [X] T028 [P] [US4] Write failing `src/app/_components/marketing/integration-tabs.test.ts`: pure state module — default `"cli"`, covers all 3 tab transitions (`"cli"`/`"skillFile"`/`"curl"`)

### Implementation for User Story 4

- [X] T029 [P] [US4] Implement `src/app/_components/marketing/hero-panel.tsx`: client island wiring T027's state module to the two hero visual views — depends on T008, T027
- [X] T030 [P] [US4] Implement `src/app/_components/marketing/integration-tabs.tsx`: client island wiring T028's state module to the three code-sample tabs — depends on T013, T028
- [X] T031 [US4] Wire `hero.tsx`/`integrations.tsx` to render `<HeroPanel />`/`<IntegrationTabs />` in place of their static defaults — depends on T029, T030
- [X] T032 [US4] Manual check: quickstart.md steps 7-8 (hero panel toggle, integration tabs)

**Checkpoint**: all four user stories independently functional; full mockup interaction parity reached.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Feature-wide requirements that don't belong to a single user story (scroll-reveal animation, SEO/social metadata, final verification).

- [X] T033 [P] Implement `src/app/_components/marketing/reveal.tsx`: `IntersectionObserver`-based scroll-reveal wrapper with a `prefers-reduced-motion` bypass and a safety-net timer (per research.md); wrap each section in `src/app/page.tsx`
- [X] T034 [P] Add `src/app/icon.tsx`: favicon generated via `next/og`'s `ImageResponse` from the mockup's bar-mark SVG
- [X] T035 [P] Add `src/app/opengraph-image.tsx`: 1200×630 share image via `next/og`'s `ImageResponse`
- [X] T036 Complete the `metadata` export in `src/app/page.tsx` with full title/description/`openGraph`/`twitter` per contracts/marketing-page-ui.md's Metadata contract — depends on T034, T035
- [X] T037 Manual check: quickstart.md steps 5-6 (reduced motion, JavaScript disabled)
- [X] T038 Manual check: quickstart.md step 9 (responsive at mobile/tablet widths)
- [X] T039 Manual check: quickstart.md step 10 (title/meta description/OG/Twitter tags, favicon, share image)
- [X] T040 Run `pnpm typecheck && pnpm lint && pnpm build` and fix any resulting errors
- [X] T041 Full quickstart.md walkthrough sign-off

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories.
- **User Stories (Phase 3-6)**: All depend on Foundational completion.
  - US1 (P1, MVP) has no dependency on US2-4.
  - US2 (P1) depends on US1's `page.tsx` composition (T017) existing to attach the nav to, and on T003 (Setup).
  - US3 (P2) depends on US2's nav (T020) existing (the toggle button lives inside it) and on T004/T005 (Foundational).
  - US4 (P3) depends on US1's `hero.tsx`/`integrations.tsx` (T008/T013) existing to convert into client islands.
- **Polish (Phase 7)**: Depends on all four user stories being complete.

### Within Each User Story

- Tests are written and confirmed failing before implementation.
- Independent section/logic-module tasks marked `[P]` before the composition task that wires them together.
- Story complete before moving to the next priority.

### Parallel Opportunities

- T001/T002/T003 (Setup) run in parallel.
- T008-T016 (all nine US1 section components) run in parallel — different files, no cross-dependency.
- T027/T028 (US4 pure logic tests) run in parallel; T029/T030 (US4 client islands) run in parallel once their respective tests exist.
- T033/T034/T035 (Polish) run in parallel.

---

## Parallel Example: User Story 1

```bash
# Launch all nine US1 section components together (after T007's test exists and fails):
Task: "Implement src/app/_components/marketing/hero.tsx"
Task: "Implement src/app/_components/marketing/trust-strip.tsx"
Task: "Implement src/app/_components/marketing/how-it-works.tsx"
Task: "Implement src/app/_components/marketing/governance.tsx"
Task: "Implement src/app/_components/marketing/features.tsx"
Task: "Implement src/app/_components/marketing/integrations.tsx"
Task: "Implement src/app/_components/marketing/compliance-cta.tsx"
Task: "Implement src/app/_components/marketing/final-cta.tsx"
Task: "Implement src/app/_components/marketing/footer.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories).
3. Complete Phase 3: User Story 1.
4. **STOP and VALIDATE**: run T018, confirm the homepage's real content renders.
5. Demo if ready — nav/theme/interactivity land in the following phases.

### Incremental Delivery

1. Setup + Foundational → shell scaffolding ready.
2. US1 → homepage content complete (MVP).
3. US2 → nav wayfinding works.
4. US3 → theme toggle works and persists.
5. US4 → hero panel and integration tabs become interactive.
6. Polish → scroll-reveal, SEO/social metadata, full quickstart sign-off.

---

## Notes

- `[P]` tasks touch different files with no incomplete-task dependency.
- `[Story]` label maps each task to its user story for traceability.
- Commit after each task or logical group.
- Stop at any checkpoint to validate a story independently.
- No jsdom/`@testing-library` dependency is added — manual quickstart.md steps
  are the verification path for actual click-driven interaction, theme
  persistence across reload, and visual/mockup parity (see plan.md's Testing
  approach and research.md).
