---
epic: 004-app-shell-and-landing
feature: 005-mobile-responsive-nav
status: done
dependencies: ["archive/002-app-shell-and-navigation.md"]
---

# Mobile-Responsive App Shell Nav

Discovered 2026-08-05 while manually verifying `010-ui-polish-and-accessibility/001-cross-page-polish-and-accessibility.md`'s responsive-layout requirement at a real mobile viewport (390×844, iPhone-sized). The app shell's left nav (`src/app/(app)/_components/app-shell.tsx`, built by `archive/002-app-shell-and-navigation.md`) was a fixed-width column at every viewport size — it never collapsed, hid behind a hamburger toggle, or became an off-canvas drawer. At mobile width the nav (and, on pages with a second fixed-width sidebar like governance's scope tree) consumed most or all of the viewport, pushing primary page content off-screen and forcing horizontal scroll to reach it.

**Completed 2026-08-05.** No mockup depicted a mobile nav treatment — built as an explicit design decision (confirmed with the user directly) rather than waiting on one, reusing this app's already-established off-canvas drawer visual language (the same backdrop + fixed-panel + explicit "×" close button pattern already used by every policy/objective/team/project drawer in the app) rather than inventing a new interaction pattern.

## Requirements

- [X] Nav pattern: hamburger-triggered off-canvas drawer, matching this shell's existing drawer visual language (no separate mockup needed — this app's drawers are already a well-established, consistent pattern)
- [X] Nav collapses/hides below `md:` (768px) — tablet width already rendered acceptably per manual testing, so that's the breakpoint; a visible, keyboard-operable hamburger toggle appears in a slim mobile top bar in its place
- [X] Toggle control and open/closed nav state meet this repo's accessibility conventions: `aria-expanded`/`aria-controls` on the toggle, an explicit `aria-label="Close navigation"` button (not just backdrop-tap), dismissible via Escape (a new addition — no other drawer in the app had this before; added here since it's a real, low-cost accessibility improvement for a freshly-built interactive pattern). The off-canvas panel is `hidden` (not just visually translated off-screen) when closed, keeping its links out of tab order.
- [X] Governance's own secondary fixed-width sidebar (the scope tree, `src/app/(app)/teams/[teamId]/scope-tree.tsx`) also collapses at the same breakpoint, via the identical drawer pattern (its own toggle, backdrop, and close button — `ScopeTree` gained an optional `onClose` prop for this, backward-compatible)

## Acceptance Criteria

- [X] At 390px width, every route checked (`/prompts`, `/dashboard`, and both governance pages) shows its primary content with no required horizontal scroll and no hidden/unreachable primary action — live-verified
- [X] The nav toggle is keyboard-operable (`aria-expanded`/`aria-controls`, Escape-to-close) and its state is announced correctly; automated axe checks confirm no critical/serious violations
- [X] Desktop and tablet nav behavior has no regression — `md:` and up render exactly as before (`md:sticky md:flex`, unconditionally visible)

## Open Questions

- **Resolved**: governance's scope tree collapses into its own secondary off-canvas drawer (not stacked above main content) — selecting a scope auto-closes the drawer, matching the primary nav's auto-close-on-navigate behavior.

## Dependencies

- `backlog/004-app-shell-and-landing/archive/002-app-shell-and-navigation.md` (the shell this modifies)
- Unblocked `backlog/010-ui-polish-and-accessibility/001-cross-page-polish-and-accessibility.md`'s responsive-layout Requirement/Acceptance Criteria, which could not pass while this was open

## Technical Notes

Filed and then resolved in the same working session — the initial finding (during `010-ui-polish-and-accessibility/001`'s audit) deliberately did not build an ad hoc collapsible-nav pattern inline, since it's shared shell infrastructure every page depends on. The user then explicitly asked to resolve this and the dashboard-content blocker together to close out that pass, which is what authorized building this without a source mockup.

`AppShell` (`src/app/(app)/_components/app-shell.tsx`) gained `"use client"` and local `useState`/`useEffect` for the toggle — safe since it already composed pre-existing client components (`AccountFooter`, `AppNavigation`) as children/props from a server `layout.tsx`, and its own imports pull in nothing server-only (just `@/shared/ui`'s `LogoMark`/`Wordmark`). `navigation`/`children` continue to arrive as already-rendered `ReactNode` from the server layout — a standard, supported Next.js pattern (server-rendered subtrees passed as props/children into a client component boundary), not a rewrite of how those subtrees render.
