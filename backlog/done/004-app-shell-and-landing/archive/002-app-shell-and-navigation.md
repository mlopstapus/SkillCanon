---
epic: 004-app-shell-and-landing
feature: 002-app-shell-and-navigation
status: done
dependencies: ["archive/001-design-tokens-and-theming.md", "backlog/002-identity-access/archive/004-jwt-session-auth.md"]
---

# App Shell & Navigation

The real, finished authenticated app shell — left nav, layout, and auth-gated routing — that every downstream epic's own UI feature (Governance, Prompt Registry, Workflow Orchestration, Distribution's remaining core pages, Billing) composes its pages into. Build directly from the shell markup shared by `SkillCanon Audit.dc.html` and `SkillCanon Governance.dc.html` (claude.ai/design project `7babdbf3-c063-46b5-84df-ffa9f588d88a`, via the `claude_design` MCP server / `DesignSync get_file`) rather than reinventing it — the same file, markup, and porting approach `003-audit-compliance/003-audit-log-ui.md`'s Technical Notes already established for one page.

## Requirements

- [x] Left nav, "Workspace" section: Overview, Prompts, Governance, Teams, Workflows, Projects, Metrics; Settings contains API keys and Audit log.
- [x] Account footer: avatar-initial badge, name, role · team subtext, chevron.
- [x] Real session-auth middleware (httpOnly JWT cookie from `002-identity-access/archive/004-jwt-session-auth.md`) gates every current authenticated app route before protected rendering; downstream UI features compose through the shared shell.
- [x] This feature builds only the shell/chrome (nav, layout, routing gate); page content for each section remains each owning BC's responsibility.

## Acceptance Criteria

- [x] Unauthenticated access to any current authenticated app route redirects to login before protected content is returned.
- [x] The shared shell exposes the real navigation/composition point and `/settings/audit-log` destination for `003-audit-compliance/003-audit-log-ui.md`, whose page content remains owned by that feature.
- [x] Nav highlights the active section correctly across direct, nested, governance, and team-administration routes.

## Open Questions

- **Resolved**: use the Governance mockup's `Overview / Prompts / Governance / Teams / Workflows / Projects / Metrics` composition. Prompt Registry owns distinct `/prompts/*` and `/projects/*` routes; Governance owns `/teams/{teamId}/policies` and `/objectives`, while team administration owns other `/teams/**` routes.

## Dependencies

- `archive/001-design-tokens-and-theming.md`
- `backlog/002-identity-access/archive/004-jwt-session-auth.md` (httpOnly JWT cookie this feature's middleware verifies)

## Technical Notes

Per this feature's own Overview, treat the mockup files as literal blueprints (markup + inline styles + component logic), not just visual reference — pull the actual file content via `DesignSync get_file` and port it, rather than re-deriving the shell from a description.

## Completion Notes

Implemented and verified by `013-app-shell-navigation`: the shell, pre-render
proxy, server layout gate, active navigation, account footer, `/dashboard`
composition point, and provisional `coreFeaturesEnabled` entitlement facade
are complete. Persisted Billing plan/override resolution and the downstream
Audit Log page remain owned by their respective backlog features.
