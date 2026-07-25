# Phase 1 Data Model: Marketing Landing Page

No database entity is introduced or touched by this feature (see spec's Key
Entities: "None"). The only state is client-side and ephemeral/browser-local;
documented here for completeness since it shapes the pure logic modules in
Project Structure.

## ThemePreference (client-local, `localStorage`)

| Field | Type | Notes |
|---|---|---|
| `value` | `"dark" \| "light"` | The visitor's chosen theme for the marketing page only |
| storage key | `"skillcanon-marketing-theme"` | Namespaced so it can never collide with a future `(app)`-side preference key |

- Default: `"dark"` when no stored value exists (FR-008).
- Written on every toggle click; read once on mount and via the blocking
  inline script for first-paint (see research.md).
- Scoped to the marketing subtree's wrapper element via a `data-theme`
  attribute — never read or written by any `(app)` route code.

## HeroPanelView (component-local, ephemeral)

| Field | Type | Notes |
|---|---|---|
| `view` | `"skills" \| "graph"` | Which hero visual is shown |

- Default: `"skills"` (matches the mockup's default `data-hero-panel="ide"`
  state, renamed here to the domain-meaningful `"skills"`/`"graph"` rather
  than the mockup's internal `ide`/`tree` implementation names).
- Not persisted — resets to `"skills"` on every page load (FR-009 has no
  persistence requirement, unlike the theme).

## IntegrationTab (component-local, ephemeral)

| Field | Type | Notes |
|---|---|---|
| `tab` | `"cli" \| "skillFile" \| "curl"` | Which code sample is shown |

- Default: `"cli"` (matches the mockup's default `windsurf` tab, renamed to
  `"cli"` since the mockup's own tab label is "cli").
- Not persisted (FR-010 has no persistence requirement).
