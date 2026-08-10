---
type: foundations
item: 010-design-system
status: done
deliverable: docs/context/design-system.md
---

# Design System

`008-distribution/003-web-ui-shell-and-core-pages.md` deliberately carries the existing shadcn/Tailwind primitives forward unchanged — it's a functional-parity rebuild, not a visual one. Before `010-ui-polish-and-accessibility` can start applying a real visual/UX pass across every page, the project needs a written, permanent answer for what that visual system actually is: palette, type scale, spacing/tokens, and which shadcn component variants are in vs. customized. Without this doc, each `010-ui-polish-and-accessibility` feature would be re-deciding brand basics page by page, producing an inconsistent result.

## What We Need to Decide / Research

- Color palette (light + dark mode) — brand colors, semantic colors (success/warning/danger/info), neutral scale
- Typography — font family, type scale, weight usage
- Spacing/sizing scale and any layout grid conventions
- Which shadcn components get restyled vs. used as-is; any new component variants needed (e.g. a denser table variant for prompt/policy list views)
- Iconography — icon set in use, sizing conventions
- Motion/transition conventions (if any) for state changes, loading, page transitions
- How design tokens are expressed in code (Tailwind config theme extension vs. CSS variables) so `004-app-shell-and-landing/001-design-tokens-and-theming.md` has a concrete implementation target

## Options / Considerations

- Reuse mockups already produced in Claude design as the source of truth for palette/typography rather than deriving from scratch — extract tokens from those mockups instead of relitigating brand direction here
- Keep shadcn's underlying primitive/accessibility behavior untouched; this is a theming pass, not a component-library swap
- Dark mode: confirm whether it's in scope for this pass or a later one — affects whether tokens need light/dark pairs now

## Resolution (2026-07-23)

Pulled directly from the Claude design MCP (`claude.ai/design` project `7babdbf3-c063-46b5-84df-ffa9f588d88a`) rather than re-derived: `SkillCanon Audit.dc.html`, `SkillCanon Governance.dc.html`, and `SkillCanon Landing.dc.html` already shared one concrete token set (colors, three-family typography, radii, shadows, motion, component conventions), confirmed byte-for-byte against each mockup's own inline `<style>`/`PALETTE`/`ACCENTS` definitions — nothing here was invented. Findings written to `docs/context/design-system.md` (moved from `context/design-system.md` by an unrelated concurrent doc-reorg commit — content unchanged).

- **Dark mode is in scope now, decided as dark-only for the authenticated app**: `SkillCanon Audit.dc.html`/`SkillCanon Governance.dc.html` (the app context) render dark-only with no toggle. `SkillCanon Landing.dc.html` (marketing) has a real light/dark toggle with a distinct light palette (confirmed via its `PALETTE.light` JS object — `--bg:#f5f6f9`, `--surface:#ffffff`, etc.; `--panel`/`--raise`, being app-shell-only concepts, have no light counterpart since marketing never uses them). Both palettes are captured in `docs/context/design-system.md` and implemented as CSS custom properties + a `[data-theme="light"]` override in `src/app/globals.css` (`004-app-shell-and-landing/001-design-tokens-and-theming.md`).
- Tokens are expressed as CSS custom properties (matching the mockups directly) mapped into Tailwind v4's `@theme inline` block, not a `tailwind.config.ts` theme-extend object — Tailwind v4 is CSS-config-first.
- shadcn's underlying accessibility/behavior primitives are untouched; only visual tokens changed.

## Deliverable

`docs/context/design-system.md` — palette, type scale, spacing/tokens, shadcn variant decisions.

## Dependencies

None.
