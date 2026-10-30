# Feature Specification: Tribe Visual Identity (part 1)

**Feature Branch**: `feat/tribe-visual-identity`  **Source**: `backlog/018-internal-tribe-edition/003-tribe-visual-identity.md` (Ben's spec). Stacked on #125 (018/001) only for `.specify/feature.json`/layout; no code dependency beyond the removed marketing CSS.

## Scope of this PR
Everything the brief allows before decision D5 (licensed fonts and Tribe logos cannot go in a public repository): colour tokens, light/dark themes with a toggle, type roles with fallback stacks, ink-tinted shadows and scrim, house easing, reduced motion, AA contrast, focus ring.

## Requirements covered
- Colour tokens remapped in `globals.css` (semantic names unchanged): paper/ink surfaces, hierarchy from ink opacity, cyan only on focus/links/tints, no pure white/black, ink-tinted shadows and scrim.
- Dark theme (`html[data-theme=dark]`, ink surfaces) with a toggle (sidebar and auth pages), applied before paint and persisted in localStorage. Light is the default.
- Type: Bricolage/Hanken/Spline removed (no `next/font/google`: also removes the Google Fonts build dependency); roles use TribeSerif/TribeSans/TribeCaption names with system fallbacks; serif forced to weight 300; eyebrows are ink.
- Status colours use the brand accent family, AA in both themes. Motion: house easing, 0.3-0.65 s, plain fade under reduced motion.
- Contrast: every text/background token pair verified AA; live axe colour-contrast run in the e2e walk (dashboard, skills, metrics, API keys; both themes).

## Out of scope (waits on D5 or later)
Font files and Tribe logo/symbol (`LogoMark`, `Wordmark`, favicon keep the SkillCanon mark, recoloured), the per-page eyebrow/label move from mono to the caption face, screenshot-by-screenshot brand-guide review by Ben.
