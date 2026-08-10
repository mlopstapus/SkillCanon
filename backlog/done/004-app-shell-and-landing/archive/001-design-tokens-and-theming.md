---
epic: 004-app-shell-and-landing
feature: 001-design-tokens-and-theming
status: done
dependencies: ["backlog/000-foundations/archive/010-design-system.md"]
---

# Design Tokens & Theming

Implement the app's real palette, type scale, spacing, and component-variant decisions into the Tailwind/shadcn theme layer. Every downstream epic's own UI feature applies these tokens rather than inventing its own — this is the one place color, type, and spacing values are actually defined.

**Moved here (2026-07-23)** from `010-ui-polish-and-accessibility` (formerly `009-ui-redesign`), where it originally assumed a from-scratch research pass against `context/design-system.md`. That assumption no longer holds: `context/design-system.md` (`backlog/000-foundations/010-design-system.md`) is still nominally open, but its actual answer already exists in practice — three independent Claude design mockups (`SkillCanon Audit.dc.html`, `SkillCanon Governance.dc.html`, `SkillCanon Landing.dc.html`, all in claude.ai/design project `7babdbf3-c063-46b5-84df-ffa9f588d88a`) already share (or nearly share) one concrete dark-theme token set, and `003-audit-compliance/003-audit-log-ui.md` already shipped a local, hardcoded copy of it before this epic existed.

**Correction (2026-07-23, at implementation):** the claim above that `003-audit-log-ui.md` "already shipped a local, hardcoded copy" was stale by the time this feature was implemented — that page was never built (no `settings/audit-log` route exists in `src/app`). `003-audit-log-ui.md`'s own Technical Notes had already been updated to say the same thing (this epic landing first meant the throwaway version was never written). Nothing needed reconciling; the requirement below is satisfied vacuously.

## Requirements

- [x] Extract the exact token values already proven across the Audit/Governance mockups into `docs/context/design-system.md` and the Tailwind theme config: `--bg`/`--panel`/`--surface`/`--surface2`/`--raise`, `--border`/`--border2`, `--text`/`--dim`/`--faint`, accent `--a`/`--a2`/`--afg`/`--asoft`/`--aglow` (teal), semantic `--green`/`--blue`/`--red`/`--violet` + their `*soft` variants, and the three font families (Bricolage Grotesque for display, Hanken Grotesk for body, Spline Sans Mono for mono/data) — treat these as an already-made decision to formalize, not something to re-derive from scratch
- [x] Resolve the light/dark-mode question explicitly: `SkillCanon Landing.dc.html` implements a working light/dark theme toggle with a distinct light palette, while `SkillCanon Audit.dc.html`/`SkillCanon Governance.dc.html` (the authenticated app) only ever show a dark theme with no toggle — decide whether the authenticated app is intentionally dark-only (matching what's actually been designed so far) or needs a light mode added, before finalizing the token system either way
- [x] shadcn component variants customized per the above (denser table variant for list views, badge/pill variants matching the mockups' action/transport/mode color-coding) without modifying shadcn's underlying accessibility/behavior primitives
- [x] Reconcile `003-audit-compliance/003-audit-log-ui.md`'s locally-scoped token copy against this shared system and repoint it here, deleting the local copy (per that feature's own forward-pull note) — N/A, see Correction above; nothing was ever shipped to reconcile
- [x] A single shared theme/style reference so every downstream epic's UI feature has one place to check token usage instead of re-deriving it per page

## Acceptance Criteria

- [x] Changing a token value (e.g. the accent color) propagates without a per-page code change — CSS custom properties in `src/app/globals.css`, mapped into Tailwind v4 via `@theme inline`; every utility class (`bg-a`, `text-dim`, `bg-surface`, `font-display`, …) derives from the same variable
- [x] `003-audit-compliance/003-audit-log-ui.md` (already shipped) is repointed at the shared tokens with no visual regression — N/A per Correction above (page not yet built); that feature's own dependency on this one already points at the real system
- [x] No page-level feature in any downstream epic needs to hardcode a color, font size, or spacing value outside the token system — token/utility coverage now includes color, font family, radius, shadow, and motion/keyframe scales
- [x] Existing shadcn component behavior (keyboard nav, focus states, ARIA attributes) is unchanged — only visual styling changed — `Badge`/`Table` are plain styled markup with no interactive/ARIA behavior of their own to regress

## Open Questions

- ~~Light mode for the authenticated app: in scope for this feature, or a deliberately deferred later pass?~~ Resolved: the authenticated app is dark-only (matches both mockups, neither has a toggle). Light theme is implemented as a `[data-theme="light"]` CSS override, scoped for `003-marketing-landing-page.md`'s use — never applied to the `(app)` route group.

## Dependencies

- `backlog/000-foundations/archive/010-design-system.md`

## Technical Notes

Land this before `002-app-shell-and-navigation.md` and every downstream epic's own UI feature — all of them depend on it. Per CLAUDE.md, the app already pins `shadcn`/Tailwind conventions — this feature rethemes that system, it doesn't replace the component library.

### Implementation (2026-07-23)

- Pulled `SkillCanon Audit.dc.html` and `SkillCanon Landing.dc.html` directly via the `claude_design`/`DesignSync` MCP (project `7babdbf3-c063-46b5-84df-ffa9f588d88a`) rather than re-deriving colors by eye — confirmed both mockups' inline `<style>` blocks (and the Landing mockup's JS `PALETTE`/`ACCENTS` theme-toggle maps) match `docs/context/design-system.md` byte-for-byte.
- Tailwind v4 (CSS-first config, no `tailwind.config.ts`) + `@tailwindcss/postcss`, added as devDependencies (build-time only — not needed in the `.next/standalone` runtime image per CLAUDE.md's bundling note). `class-variance-authority`/`clsx`/`tailwind-merge` added as real runtime dependencies (used by `cn()` and component variants).
- `src/app/globals.css`: dark tokens on `:root` (the app's only theme), light tokens under `[data-theme="light"]` (marketing-only — deliberately omits `--panel`/`--raise`, which the Landing mockup's own palette never defines), all mapped into Tailwind's theme via `@theme inline` (`--color-*`, `--font-sans`/`--font-mono`/`--font-display`, `--radius-*`, `--shadow-*`, `--animate-*`), plus the mockups' keyframes (`fadeUp`, `toolIn`, `blink`, `floaty`, `glowpulse`, `dashmove`, `spin`, `sheen`, `ovIn`, `drIn`).
- Fonts wired via `next/font/google` in `src/app/layout.tsx` (Bricolage Grotesque 500/600/700, Hanken Grotesk 400/500/600/700, Spline Sans Mono 400/500/600) — self-hosted at build time rather than the mockups' runtime Google Fonts `<link>`, matching Next.js convention.
- `src/shared/ui/` (the repo's existing shared-component location per `docs/context/repo-structure.md`): `utils.ts` (`cn()`), `badge.tsx` (neutral/accent/green/blue/red/violet variants + optional leading dot, matching the mockups' verb/transport badges), `table.tsx` (shadcn-shape `Table`/`TableHeader`/`TableRow`/`TableCell`/etc. with a `dense` cell variant for list views), re-exported from `index.ts`.
- `components.json` added at repo root so the `shadcn` CLI can add further components later, aliased to this repo's actual `@/shared/ui` location (not the shadcn-default `@/components`).
- Verified with `pnpm typecheck`, `pnpm lint`, and a live `pnpm dev` render (screenshot) showing correct dark surfaces, teal accent, all three type families, and semantic badge colors.

### Known drift not fixed by this feature

An unrelated concurrent commit (`2658c26`, "move docs") relocated `context/` → `docs/context/` while this feature was in progress, including `context/design-system.md` → `docs/context/design-system.md`. That commit did not update any of the path references CLAUDE.md itself warns need checking on a directory move (CLAUDE.md's own body text, other `backlog/**/EPIC.md` and feature files still say `context/...` throughout). This feature's own files were updated to the new `docs/context/` path; the wider repo-wide reference cleanup is out of this feature's scope and is not tracked as a backlog item anywhere yet.
