---
epic: 004-app-shell-and-landing
feature: 005-mobile-responsive-nav
status: open
dependencies: ["archive/002-app-shell-and-navigation.md"]
---

# Mobile-Responsive App Shell Nav

Discovered 2026-08-05 while manually verifying `010-ui-polish-and-accessibility/001-cross-page-polish-and-accessibility.md`'s responsive-layout requirement at a real mobile viewport (390×844, iPhone-sized). The app shell's left nav (`src/app/(app)/_components/...`, built by `archive/002-app-shell-and-navigation.md`) is a fixed-width column at every viewport size — it never collapses, hides behind a hamburger toggle, or becomes an off-canvas drawer. At mobile width the nav (and, on pages with a second fixed-width sidebar like governance's scope tree) consumes most or all of the viewport, pushing primary page content off-screen and forcing horizontal scroll to reach it.

**Confirmed shell-wide, not page-specific**: reproduced on both `/prompts` (content technically reachable via horizontal scroll, but severely squeezed and badly word-wrapped) and `/teams/[teamId]/objectives` (governance's second fixed-width scope-tree sidebar pushes the entire main content panel fully off-screen — nothing in it is visible or reachable without scrolling right). Since every `(app)` page shares the same nav shell, every page is affected equally; this is not something any individual page-level feature (including `031-governance-views-ui`) could have fixed on its own.

This was not caught by `specs/001-cross-page-polish/`'s original pass — that work's manual responsive checks were apparently never actually run at a true mobile breakpoint (or a collapsible nav was assumed to already exist and wasn't re-verified). See `010-ui-polish-and-accessibility/001`'s own status notes for how this blocks that item's Requirements/Acceptance Criteria.

## Requirements

- [ ] Decide the mobile nav pattern: hamburger-triggered off-canvas drawer is the most common fit for this shell's existing left-nav structure, but confirm against a real mockup if one exists (check the Claude Design project, `7babdbf3-c063-46b5-84df-ffa9f588d88a`, for a mobile nav treatment before inventing one — none of this app's other UI has ever been built without a source mockup)
- [ ] Nav collapses/hides below a defined breakpoint (suggest matching Tailwind's `md:` — 768px — since tablet width already renders acceptably per manual testing) and is reachable via a visible, keyboard-operable toggle control
- [ ] Toggle control and open/closed nav state both meet this repo's accessibility conventions (focus trap or at least logical focus order while open, `aria-expanded`/`aria-controls` on the toggle, dismissible via Escape and an explicit close action, not just background-tap)
- [ ] Any page with its own secondary fixed-width sidebar (governance's scope tree, `src/app/(app)/teams/[teamId]/scope-tree.tsx`) also collapses or stacks at the same breakpoint — the shell fix alone won't resolve governance's compounding second-sidebar issue

## Acceptance Criteria

- [ ] At 390px width, every route in `010-ui-polish-and-accessibility/001`'s in-scope route inventory (plus `/teams/[teamId]/policies` and `/objectives`) shows its primary content with no required horizontal scroll and no hidden/unreachable primary action
- [ ] The nav toggle is keyboard-operable and its state is announced correctly to a screen reader
- [ ] Desktop and tablet nav behavior (already working) has no regression

## Open Questions

- Whether governance's scope tree should collapse into a secondary drawer, stack above the main content, or something else entirely — no mockup shows this either; needs its own small design decision within this feature.

## Dependencies

- `backlog/004-app-shell-and-landing/archive/002-app-shell-and-navigation.md` (the shell this modifies)
- Blocks `backlog/010-ui-polish-and-accessibility/001-cross-page-polish-and-accessibility.md`'s responsive-layout Requirement/Acceptance Criteria from ever passing as long as this is open

## Technical Notes

Filed instead of building an ad hoc collapsible-nav pattern inline while auditing an unrelated page — this is shared shell infrastructure every page depends on, a real architectural addition (not a page-level polish fix), and deserves its own scoped design/implementation pass rather than a rushed change made while doing a different feature's verification work.
