---
epic: 004-app-shell-and-landing
feature: 003-marketing-landing-page
status: done
dependencies: ["archive/001-design-tokens-and-theming.md"]
---

# Marketing Landing Page

The public, unauthenticated marketing homepage — distinct from the authenticated app shell in `archive/002-app-shell-and-navigation.md`. Build from `SkillCanon Landing.dc.html` (claude.ai/design project `7babdbf3-c063-46b5-84df-ffa9f588d88a`), pulled via the `claude_design` MCP server the same way `003-audit-compliance/003-audit-log-ui.md` pulled its own mockup.

Implemented via the spec-kit workflow at `specs/014-marketing-landing-page/` (spec, plan, tasks, contracts).

## Requirements

- [x] Public nav: How it works / Governance / Features / Integrations / Quickstart anchor links, a Docs link (to the GitHub repo's `docs/` per the mockup), a GitHub link, and a light/dark theme toggle
- [x] Hero and remaining marketing sections per the mockup — pull the full file content before implementing rather than working from a partial read; this feature file was written from only the nav/hero portion of the mockup
- [x] Light/dark theme both implemented (this page's mockup has a working toggle, unlike the dark-only authenticated-app mockups — see `archive/001-design-tokens-and-theming.md`'s resolved Open Question, and the `[data-theme="light"]` override already added in `src/app/globals.css`)

## Acceptance Criteria

- [x] Page visually matches `SkillCanon Landing.dc.html`, in both light and dark mode
- [x] Every anchor nav link scrolls to its corresponding section

## Open Questions

- ~~**Scope/ownership, unresolved**: is a public marketing site actually in scope for this repo/product...~~ Resolved: yes, in-app at the site's root route (`/`), replacing the prior placeholder scaffold. `docs/context/design-system.md` already documented a "marketing" token context, and `archive/001-design-tokens-and-theming.md`'s light-theme override was already explicitly scoped for this feature's use — see `specs/014-marketing-landing-page/spec.md`'s Assumptions for the full reasoning.

## Dependencies

- `archive/001-design-tokens-and-theming.md`

## Technical Notes

Unlike `archive/002-app-shell-and-navigation.md`, this page shares no session/auth-gating concerns — it's the page an unauthenticated visitor sees. Keep its token usage aligned with `archive/001-design-tokens-and-theming.md` even though its palette has a light-mode variant the authenticated app currently doesn't.
