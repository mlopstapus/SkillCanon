---
epic: 018-internal-tribe-edition
feature: 003-tribe-visual-identity
status: open
dependencies: []
---

# Tribe Visual Identity

Apply Tribe's brand from the `tribe-bazaar:tribe-design` skill, `brand/GUIDE.md`. Its `brand/assets/tribe-tokens.css` holds the token values, and `brand/assets/fonts/` and `brand/assets/logos/` hold the files.

## Requirements

- [x] **Colour tokens.** `src/app/globals.css` maps the app's existing semantic tokens to Tribe's palette, so the pages need no rework:
  - surfaces are paper (`#FAFAF8`, `#F4F4F2`, `#EBEBE2`) and the ink is `#06141B`;
  - brand cyan `#65D9EE` appears only on focus rings, links and small highlights;
  - hierarchy comes from ink opacity (body `/70`, meta `/45`–`/60`, hairlines `/6`–`/15`), not from greys;
  - there is no pure white, no pure black and no grey shadow. Floating elements use the ink-tinted shadow.
- [x] **Dark theme.** Ink surfaces (`#06141B` / `#050F15`) with paper text. Keep the theme toggle, if 001 kept it.
- [ ] **Type.** _(part done: Bricolage/Hanken/Spline removed, type roles + fallback stacks, serif weight 300, eyebrows ink; the licensed font files and the mono→caption label pass wait on D5)_ TribeSerif Light (300, never bold) for headings, TribeSans for body and UI, and TribeCaption uppercase with tracking for eyebrows, labels and buttons. Eyebrows are ink, never an accent colour. Replace the Bricolage, Hanken and Spline imports in `src/app/layout.tsx`. Monospace stays for code and keys.
- [ ] **Logo.** _(needs D5: Tribe symbol/wordmark files; the SkillCanon mark is only recoloured to the new tokens)_ `LogoMark` and `Wordmark` in `@/shared/ui` render Tribe's symbol and wordmark, with the inverted variants on dark surfaces. Don't recolour or stretch them. `src/app/icon.tsx` (the favicon) uses the Tribe symbol.
- [x] **Accents.** Teal, brown, orange and yellow appear only on numerals and single cards, never on body copy or large fills. That covers the metrics charts and status chips.
- [x] **Motion.** The house easing `cubic-bezier(0.625, 0.05, 0, 1)` at 0.3–0.65s. Under `prefers-reduced-motion`, a plain fade. Nothing bouncy.
- [x] **Contrast.** Text meets WCAG AA in both themes, including ink at reduced opacity.

## Acceptance Criteria

- [ ] (needs Ben) Screenshots of these screens, attached to the PR, are checked against the brand guide's Do's and Don'ts: login, dashboard, a skill page, the metrics page, settings, the audit log, and phone width. Light and dark for each.
- [x] `grep -rE "Bricolage|Hanken|Spline_Sans" src` returns nothing.
- [x] `pnpm test:e2e` is green. The accessibility checks already in the suite still pass (plus a live axe colour-contrast run in both themes).

## Technical Notes

- **Blocked in part by decision D5.** The repository is public, and the font files are licensed. The colour tokens, type roles, motion and dark theme can land before D5 with a system-font fallback stack. The font files and logos land after it.
- Load fonts with `next/font/local` once their location is decided. Don't add a CDN.
- Prefer remapping the existing CSS variables over editing class names page by page.
