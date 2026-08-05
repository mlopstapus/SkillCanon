# Cross-Page Polish & Accessibility Research

## Decision: Shared state presentation primitive

Use a single reusable UI primitive in `src/shared/ui` for empty, loading, and error states, with page-specific title/body/action props.

**Rationale**: Existing pages already share the same token system but define empty/error states inline, which makes visual and accessibility drift likely. A shared primitive keeps layout, icon treatment, roles, and action placement consistent without redesigning owning-epic pages.

**Alternatives considered**:
- CSS-only documentation: cheaper, but does not prevent route-level divergence.
- Per-page cleanup only: preserves local flexibility, but fails the requirement for one pattern per state type.

## Decision: Document verification as a go-live audit artifact

Record the route inventory, state-pattern contract, static `axe-core` checks, and manual smoke checks in `quickstart.md` and `docs/context/design-system.md` rather than introducing an e2e harness in this pass.

**Rationale**: The current repo has Vitest component tests and no browser automation configured. A lightweight `axe-core` helper can scan server-rendered representative states without adding browser automation. Focused render tests plus documented manual audit steps satisfy the feature without destabilizing the project.

**Alternatives considered**:
- Add Playwright route automation: useful longer term, but high blast radius for a polish issue and likely to require environment setup beyond current scripts.
- No audit artifact: insufficient for release-owner handoff and future UI additions.

## Decision: Global focus-visible ring

Add a token-based `:focus-visible` outline in `src/app/globals.css` for interactive elements, while preserving component-specific border focus styles.

**Rationale**: Many inputs and buttons rely on border color only. A global outline provides a consistent keyboard-visible indicator across navigation, drawers, forms, tables, and controls in both dark and light token contexts.

**Alternatives considered**:
- Update each component class manually: precise but error-prone across the full route inventory.
- Browser default outlines: inconsistent with the design system and lower contrast on dark surfaces.

## Decision: Representative route updates

Apply the shared state primitive to prompts, projects, audit log, API keys, and access-unavailable surfaces first.

**Rationale**: These cover list/table, settings, registry, and access-error surfaces, and they exercise empty and recoverable error variants without altering domain behavior.

**Alternatives considered**:
- Rewrite every route in one pass: higher risk and not necessary where pages already have no state branch.
- Only add the primitive: fails to prove adoption on real product surfaces.
