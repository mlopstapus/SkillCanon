# SkillCanon — Design System

A dark-first, developer-tooling aesthetic: near-black neutrals, a single teal accent, three-family type system (display / body / mono), thin hairline borders, and soft accent glows. Two surfaces exist — a **marketing** context (landing page) and an **app** context (dashboard, audit log, governance) that share the same tokens with minor additions.

---

## 1. Color tokens

### Neutrals (dark — default theme)
| Token | Value | Use |
|---|---|---|
| `--bg` | `#0b0b0c` | Page background |
| `--bg2` | `#101011` | Recessed / elevated panels on marketing |
| `--panel` | `#0f0f10` | App sidebar & footers |
| `--surface` | `#161618` | Cards, inputs, resting rows |
| `--surface2` | `#1c1c1f` – `#1d1d20` | Hovered rows, chips, avatars |
| `--raise` | `#232326` | Popovers, dropdowns, tooltips (highest) |
| `--text` | `#f1f0ee` / `#f4f3f1` | Primary text |
| `--dim` | `#9b9a96` | Secondary text |
| `--faint` | `#66645f` / `#67655f` | Tertiary text, labels, disabled |
| `--grid` | `rgba(255,255,255,.03)` | Ambient grid overlay (marketing) |

### Borders (always translucent white, never solid)
| Token | Value |
|---|---|
| `--border` | `rgba(255,255,255,.07)` – `.08` |
| `--border2` | `rgba(255,255,255,.12)` – `.14` |

### Accent — teal (the only brand color)
| Token | Value | Use |
|---|---|---|
| `--a` | `#00e0b8` | Primary accent: CTAs, active state, logo mark, links |
| `--a2` | `#54efce` | Lighter accent, gradient partner |
| `--afg` | `#03130f` | Foreground text **on** accent fills |
| `--asoft` | `rgba(0,224,184,.12)` | Accent-tinted surfaces, active chips |
| `--aglow` | `rgba(0,224,184,.15)` | Accent shadow / radial glow |

### Semantic status (app only — audit verbs, diffs)
| Token | Value | Meaning |
|---|---|---|
| `--green` / `--gsoft` | `#3ecf8e` / `rgba(62,207,142,.13)` | created, diff additions (`+`) |
| `--blue` / `--bsoft` | `#19b5ff` / `rgba(25,181,255,.13)` | updated, API transport |
| `--red` / `--rsoft` | `#ff6b6b` / `rgba(255,107,107,.13)` | deleted/revoked, diff removals (`−`) |
| `--violet` / `--vsoft` | `#a78bfa` / `rgba(167,139,250,.14)` | reparented/shared/synced, CLI transport |

### Light theme (marketing toggle only)
`--bg:#f5f6f9` · `--bg2/surface:#ffffff` · `--surface2:#eef1f5` · `--border:rgba(12,14,20,.09)` · `--border2:rgba(12,14,20,.16)` · `--text:#0b0d12` · `--dim:#545963` · `--faint:#8a909c` · `--grid:rgba(12,14,20,.045)`. Accent tokens are unchanged.

### Optional accent swaps (landing prop)
- **violet** `--a:#8b5cf6 --a2:#d76bff --afg:#f6f2ff`
- **blue** `--a:#3b82f6 --a2:#22d3ee --afg:#ffffff`
- **lime** `--a:#c8ff33 --a2:#5ef2a0 --afg:#0e1400`

Teal is the default and canonical brand accent.

---

## 2. Typography

Three families via Google Fonts:

| Token | Family | Role | Weights |
|---|---|---|---|
| `--ds` | **Bricolage Grotesque** | Display — headings, logo, stat numbers | 500 / 600 / 700 |
| `--bd` | **Hanken Grotesk** | Body — paragraphs, UI text | 400 / 500 / 600 / 700 |
| `--mo` | **Spline Sans Mono** | Mono — code, labels, metadata, badges, IDs, nav eyebrows | 400 / 500 / 600 |

```
Bricolage Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700
Hanken Grotesk:wght@400;500;600;700
Spline Sans Mono:wght@400;500;600
```

### Type scale & rules
- **Display headings** (`--ds`): hero `60px`/line-height `1.02`; section `36–40px`; final CTA up to `52px`. Always `letter-spacing:-.03em` to `-.035em`, weight `700`.
- **Card / sub headings**: `18px`, weight `600`, `--ds`.
- **Body**: lead paragraphs `16–18px` line-height `1.6–1.65` in `--dim`; card body `13.5px` line-height `1.55`.
- **App base font-size**: `13px` on body.
- **Eyebrows / section kickers**: `--mo`, `12.5px`, `letter-spacing:.1em`, `text-transform:uppercase`, color `--a`.
- **Mono metadata / uppercase labels**: `10–11px`, `letter-spacing:.08–.12em`, uppercase, color `--faint`.
- Mono is used liberally to signal "system / machine" content — file paths, commands, IDs, counts, tags.
- Inline "technical" words inside body copy switch to `--mo` + `--text`.

---

## 3. Shape, elevation, motion

**Radii**
- Small chips / badges / code tags: `6px`
- Buttons, inputs, nav items, list rows: `8–9px`
- Icon tiles / avatars: `9–10px`
- Cards / panels: `11–16px`
- Large CTA panels: `20px`
- Pills: `999px`

**Borders** — hairline only, using `--border`/`--border2`. Active/accent borders use `color-mix(in srgb, var(--a) 34–45%, var(--border2))`.

**Shadows** — soft, large, black: `0 24px 60px rgba(0,0,0,.4)`, `0 30px 80px rgba(0,0,0,.5)`; drawers `-30px 0 80px rgba(0,0,0,.5)`. Accent elements add a glow: `0 8px 30px var(--aglow)` and `box-shadow:0 0 22px var(--aglow)`.

**Ambient background (marketing)** — fixed layered radial glows in accent + a masked `52px` CSS grid faded via `radial-gradient` mask.

**Motion** — easing `cubic-bezier(.2,.7,.2,1)`. Scroll reveal: `opacity 0→1` + `translateY(22px)→0` over `.7s`, staggered via `data-reveal-delay`. Named keyframes in use: `fadeUp`, `toolIn` (staggered list entries), `blink` (terminal caret), `floaty`, `glowpulse`/`glow` (pulsing status dot), `dashmove` (animated connector lines), `spin`, `sheen` (button highlight sweep), `ovIn` (overlay fade), `drIn` (drawer slide-in).

---

## 4. Components

**Buttons**
- *Primary*: `background:var(--a)`, text `var(--afg)`, weight 600, radius 9–12px, accent glow shadow; hover `translateY(-1 to -2px)`. Optional `sheen` sweep overlay.
- *Secondary*: `background:var(--surface)`, `1px solid var(--border2)`, text `var(--text)`; hover → `var(--surface2)`.
- *Ghost / nav link*: transparent, `--dim` → `--text` on hover.
- *Disabled*: `opacity:.75`, `cursor:not-allowed`, often paired with an Enterprise upsell tooltip.

**Cards** — `padding:22–24px`, `1px solid var(--border)`, `background:var(--surface)`, radius 14px. Highlighted variant uses `--border2` + `--asoft` background. Feature cards lift `translateY(-3px)` + border brightens on hover.

**Icon tile** — `38px`, radius 10px, `background:var(--asoft)`, holds a `19px` stroked line-icon (`stroke:var(--a)`, `stroke-width:1.8`).

**Badges / chips** — `--mo`, `10.5–12px`, radius 6px. Neutral: `--surface2` + `--border`. Accent: `--asoft` + `--a`. Status verbs and transports use their semantic color + soft bg, prefixed with a `6–7px` colored dot.

**Nav (marketing)** — sticky, `64px`, `backdrop-filter:blur(14px)`, translucent `--bg`, bottom hairline. Logo = 30px surface tile with the bar-mark SVG + "Skill**Canon**" wordmark (accent on "Canon").

**App shell** — `grid-template-columns: 216px minmax(0,1fr)` (sidebar + main). Sidebar on `--panel`, sections labeled with uppercase mono eyebrows, nav items 8×10px padding radius 8px, active item = `--asoft` bg + left 3px accent bar. Bottom user cell pinned with `margin-top:auto`.

**Tables / lists** — CSS-grid rows with sticky mono column headers (uppercase, `--faint`), hairline row dividers, full-row hover to `--surface`, chevron affordance at row end.

**Menus / popovers / drawers** — on `--raise`, `1px solid var(--border2)`, radius 10–11px, heavy black shadow. Detail drawer: `520px`, right-anchored, `drIn` animation, dimmed `rgba(4,5,7,.6)` blurred backdrop.

**Inputs** — `--surface` bg, `1px solid var(--border2)`, radius 9px, transparent field, `--text` value / `--faint` placeholder, leading line-icon.

**Diff view** — two-column mono grid; removals `--red` on `--rsoft` with `−`, additions `--green` on `--gsoft` with `+`; secrets redacted.

**Terminal / code panels** — window bar with traffic-light dots (`#ff5f57`/`#febc2e`/`#28c840`) + mono path label; body in `--mo`, `$`/`›` prompts and `✓` in accent, comments in `--faint`, blinking caret.

---

## 5. Layout & spacing
- Marketing max-width **1200px**, gutter `24px`. Sections vertically padded `60px`.
- Prefer flex/grid + `gap` (common gaps: `2px` nav rows, `6–12px` chips/controls, `16–18px` card grids, `40–56px` two-column splits).
- Grids: 4-up "how it works", 3-up feature grid, 2-up alternating content/visual splits.

## 6. Voice
Confident, technical, developer-to-developer. Short declarative headlines ("Ship prompts like you ship code."). Concrete nouns over adjectives. Mono type carries the "real system" credibility — actual commands, file paths, event IDs, counts. No emoji.
---

## 7. Cross-page state patterns

All in-scope app pages use one shared state presentation primitive for empty, loading, and recoverable error states. The page owns domain-specific copy and the optional action; the component owns layout, emphasis, icon treatment, and accessibility behavior.

**Empty states** use `AppState variant="empty"` from `@/shared/ui`. Copy names the missing resource and the next useful action. The optional action appears below the description and should be the same primary action the populated page exposes elsewhere, not an extra explanatory control.

**Loading states** use `AppState variant="loading"`. The spinner is decorative (`aria-hidden="true"`), the state uses `role="status"`, and the block keeps stable spacing so content does not jump when data arrives.

**Error states** use `AppState variant="error"` for recoverable page or data failures. The state uses `role="alert"`, keeps `aria-live="polite"`, and includes a recovery action when one exists. Access-denied and entitlement-denied pages may use the same variant without an action when retrying cannot resolve the condition.

**Shared accessibility contract**: every state has `aria-live="polite"`; empty/loading states expose `role="status"`; error states expose `role="alert"`; icons are decorative; action labels are unique within the state block. Page-specific exceptions may change copy or actions only. Layout, icon placement, role behavior, focus visibility, and responsive constraints remain shared.

**Verification**: representative route states are covered by Vitest render assertions and static `axe-core` checks for critical/serious violations. Release-owner manual checks still cover keyboard order, screen-reader comprehension, responsive behavior, and both supported token contexts across the full smoke path.
