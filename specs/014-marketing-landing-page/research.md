# Phase 0 Research: Marketing Landing Page

## Theme persistence & first-paint flash

**Decision**: Store the chosen theme (`"dark" | "light"`) in `localStorage`
under a marketing-scoped key. Apply it as a `data-theme` attribute on a
wrapper element around the marketing page's content only (not on `<html>` or
`<body>`, which the root layout shares with `(app)` routes). To avoid a
flash-of-wrong-theme for a returning visitor whose stored preference is
`"light"`, render a small blocking inline script as the very first child of
that wrapper (a Server Component can emit a literal `<script>` tag whose body
reads `localStorage` and sets the attribute synchronously before paint) —
the same technique libraries like `next-themes` use, reimplemented directly
since this repo has no theme-toggle dependency yet and the surface is a single
attribute flip.

**Rationale**: `docs/context/design-system.md` and this repo's own
`archive/001-design-tokens-and-theming.md` are explicit that `[data-theme=
"light"]` must never apply to `(app)` routes. Scoping the attribute to a
marketing-only wrapper (rather than `<html>`, which the shared root layout
controls) makes that leak structurally impossible instead of relying on
convention. The inline-script technique is the standard fix for
localStorage-driven theme flash in SSR frameworks and needs no new dependency.

**Alternatives considered**: A cookie read server-side in `page.tsx` (Server
Component) to pick the initial theme without any client flash — rejected
because it requires a request round-trip write (a Server Action or route
handler) just to persist a cosmetic preference, meaningfully more machinery
than a `localStorage` read for no behavioral gain. A dedicated
`next-themes`-style dependency — rejected as unnecessary for one boolean
attribute on one page.

## Interactive islands: hero panel & integration tabs

**Decision**: Two small Client Components (`hero-panel.tsx`,
`integration-tabs.tsx`), each backed by a plain, DOM-free state module
(`hero-panel.ts` exporting the two-value view type and any derived label logic;
tabs analogous) that owns no JSX and is directly unit-testable. The Client
Component itself only wires `useState` to that module's types and renders
conditionally.

**Rationale**: Matches the `nav-model.ts`/`app-navigation.tsx` split already
established in `013-app-shell-navigation` — logic lives in a plain module,
JSX stays thin. This keeps the feature testable under Vitest without adding
jsdom/`@testing-library/react` (see Testing approach below).

**Alternatives considered**: A single generic "tabbed panel" abstraction
shared across both hero panel and integration tabs — rejected; the two are
different shapes (two-way toggle vs. three-way tab list) and forcing a shared
abstraction over two call sites is premature generalization for content this
simple.

## Scroll-reveal animation & reduced motion

**Decision**: Implement the mockup's scroll-reveal behavior with a small
Client Component wrapper (`reveal.tsx`) using `IntersectionObserver` to add a
"visible" class/inline style once a section enters the viewport, with a
short `setTimeout` safety net (mirroring the mockup's own "nothing should stay
hidden" fallback) so content is never permanently stuck at `opacity: 0` if the
observer never fires. Before wiring the observer, check
`window.matchMedia("(prefers-reduced-motion: reduce)")`; when it matches,
render content at full opacity immediately with no transition.

**Rationale**: Directly satisfies the spec's reduced-motion and
JS-failure edge cases (content must never be blocked from appearing). This is
the same reveal-on-viewport-entry behavior the mockup implements by hand; a
straight port keeps behavior parity rather than re-deriving something new.

**Alternatives considered**: CSS-only scroll-driven animations
(`animation-timeline: view()`) — rejected for now due to inconsistent browser
support; would leave Safari/older-Chromium visitors with no reveal at all
where the JS+safety-net approach degrades gracefully instead.

## Testing approach given no jsdom/@testing-library dependency

**Decision**: Follow this repo's existing frontend test convention exactly:
`renderToStaticMarkup` for structural assertions (all sections present,
correct ids/hrefs, correct initial ARIA/data attributes), plain Vitest unit
tests for every DOM-free logic module, and manual verification in a real
browser (documented as explicit steps in `quickstart.md`) for actual
click-driven interaction, theme persistence across reload, and visual
comparison against `SkillCanon Landing.dc.html`. This mirrors
`013-app-shell-navigation`'s own plan, which used the identical split
(`react-dom/server` contract tests + no jsdom).

**Rationale**: No test file in this repository (`app-shell.test.tsx`,
`app-navigation.test.tsx`, `account-footer.test.tsx`) uses jsdom or
`@testing-library/react` today, and neither is a `package.json` dependency.
Introducing a new test-rendering stack for one feature would be a larger,
unrelated architectural change; the DOM-free-module extraction above already
buys back testability for the actual *logic*, which is what most needs to be
correct. Pixel/visual-equivalence and real click simulation are exactly the
kind of thing this repo's own conventions (CLAUDE.md) already say to verify
by running the dev server in a browser, not by writing a brittle simulated-DOM
test.

**Alternatives considered**: Add `@testing-library/react` + `jsdom` as new
dev dependencies for this feature — rejected; it's a repo-wide testing-stack
decision that deserves its own explicit choice (and CI/config changes) rather
than being smuggled in as a side effect of one marketing page.

## Metadata, favicon, and share image

**Decision**: Add `export const metadata` (title, description, `openGraph`,
`twitter: { card: "summary_large_image" }`) to `src/app/page.tsx`, plus two
Next.js file-based Metadata routes: `src/app/icon.tsx` (favicon, generated via
`next/og`'s `ImageResponse` from the mockup's bar-mark SVG, so no binary asset
or new `public/` directory is required) and `src/app/opengraph-image.tsx`
(1200×630 share image, same `ImageResponse` mechanism). Twitter Card falls
back to the Open Graph image per Twitter's own crawler behavior when no
separate `twitter-image` file is defined, so a single generated image serves
both.

**Rationale**: Satisfies FR-013/SC-006 with zero new dependencies (`next/og`
ships with Next.js) and without introducing a `public/` directory purely for
this feature — CLAUDE.md notes `public/` doesn't exist yet and the Dockerfile
has a `mkdir -p public` workaround pending "a real public/ directory"; adding
one prematurely for a generated icon would be an unrelated, unnecessary
change to take on here.

**Alternatives considered**: Hand-authored static `public/favicon.ico` +
`public/og-image.png` — rejected for this feature; would require producing
real binary image assets outside the coding session and would incidentally
resolve the Dockerfile's `public/` workaround, which is out of scope for this
spec and better left to whichever feature actually needs a real `public/`
directory.

## Link destinations and CTA routing

**Decision**: Already resolved during `/speckit-clarify` and encoded directly
in the spec (FR-003, FR-012, User Story 2's acceptance scenarios): GitHub/Docs
links point at `github.com/mlopstapus/SkillCanon`; undestined "Deploy" CTAs route
to the in-page `#quickstart` anchor. No further research needed.
