# Marketing Landing Page UI Contract

## Route

`src/app/page.tsx` (the site's root route, `/`). No auth/session check; not
listed in `src/proxy.ts`'s `config.matcher`, and must stay that way.

## Nav contract

| Key | Label | Target | Behavior |
|---|---|---|---|
| `logo` | SkillCanon wordmark | `#top` | In-page anchor |
| `how` | How it works | `#how` | In-page anchor scroll |
| `governance` | Governance | `#governance` | In-page anchor scroll |
| `features` | Features | `#features` | In-page anchor scroll |
| `integrations` | Integrations | `#integrations` | In-page anchor scroll |
| `quickstart` | Quickstart | `#quickstart` | In-page anchor scroll |
| `docs` | Docs | `https://github.com/mlopstapus/SkillCanon/tree/main/docs` | External, new tab, `rel="noopener"` |
| `github` | (star-count link) | `https://github.com/mlopstapus/SkillCanon` | External, new tab, `rel="noopener"`; star count is static display text, not live-fetched |
| `theme` | toggle control | — | Client island; see Theme contract |
| `cta` | "Deploy free" | `#quickstart` | In-page anchor (FR-012) |

## Section contract

Rendered in this order, each a real DOM landmark with the given `id` so nav
anchors and direct `/#fragment` links resolve:

1. Hero (`#top`, no visible section id needed beyond the anchor)
2. Trust strip (supported coding agents)
3. `#how` — How it works (four steps: Define, Govern, Distribute, Expand)
4. `#governance` — Governance model + policy-resolution example
5. `#features` — six feature cards
6. `#integrations` — integration checklist + tabs (`#quickstart` anchors the
   heading inside this section, per the mockup)
7. Compliance callout (SOC2/NIST/self-hosted/no-LLM-calls stat tiles)
8. Final CTA
9. Footer (logo, license, Docs/GitHub/API reference/Architecture links)

Every section's copy, headings, and stats match `SkillCanon Landing.dc.html`
verbatim, except the compliance callout wording (see Compliance-copy
contract).

## Theme contract

- Values: `"dark" | "light"`; default `"dark"`.
- Persisted in `localStorage["skillcanon-marketing-theme"]`.
- Applied via `data-theme="light"` (omitted entirely for dark) on the
  marketing page's own wrapper element — never on `<html>`/`<body>`, and never
  read/set by any `(app)` route.
- Toggling updates every token-driven color on the page in the same
  interaction (no partial-theme state).
- A blocking inline script (see research.md) sets the attribute before first
  paint to prevent a flash of the wrong theme for a returning visitor.

## Hero panel contract

- Values: `"skills" | "graph"`; default `"skills"`; not persisted.
- `"skills"`: shows the installed-skills list (the mockup's `ide` panel).
- `"graph"`: shows the team/policy dependency graph (the mockup's `tree`
  panel).
- Exactly one view renders at a time; the toggle control reflects which is
  active.

## Integration tabs contract

- Values: `"cli" | "skillFile" | "curl"`; default `"cli"`; not persisted.
- Exactly one code sample renders at a time; the inactive tabs are visually
  deselected (per spec User Story 4, Acceptance Scenario 2).

## Compliance-copy contract

The compliance callout's SOC2 and NIST stat tiles read alignment/intent
wording, not certification claims:

| Mockup copy (rejected) | Actual copy (required) |
|---|---|
| "SOC2 — control-aligned" | "SOC2 — Built for SOC2" |
| "NIST — framework aligned" | "NIST — NIST-aligned controls" |

The "100% self-hosted" and "0 LLM calls made" tiles are factual claims about
the architecture, not compliance-certification claims, and render unchanged.

## Metadata contract

- `metadata.title`: descriptive, product-specific (not the bare "SkillCanon"
  the root layout currently sets as its default).
- `metadata.description`: summarizes the product pitch (hero subheading, or a
  condensed version of it).
- `metadata.openGraph`: title, description, and the generated
  `opengraph-image` route.
- `metadata.twitter`: `{ card: "summary_large_image" }` (Twitter falls back to
  the Open Graph image when no separate Twitter image is defined).
- `src/app/icon.tsx`: generates the favicon from the mockup's bar-mark SVG via
  `next/og`'s `ImageResponse` — no binary asset or `public/` directory added.

## Reduced-motion / no-JS contract

- All section content MUST be present and readable in server-rendered markup
  regardless of client JS execution (FR-011, Edge Cases).
- When `prefers-reduced-motion: reduce` matches, scroll-reveal and hover
  transitions are skipped entirely (content renders at full opacity
  immediately); the theme toggle, hero panel, and integration tabs remain
  fully functional (they are discrete state changes, not motion).
- A reveal safety-net timer ensures no section can remain hidden indefinitely
  even if the `IntersectionObserver` never fires.
