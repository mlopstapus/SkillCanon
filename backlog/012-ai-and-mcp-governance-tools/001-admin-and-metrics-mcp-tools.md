---
epic: 012-mcp-admin-tools
feature: 001-admin-and-metrics-mcp-tools
status: open
dependencies: ["backlog/002-identity-access/EPIC.md", "backlog/005-governance/EPIC.md", "backlog/003-audit-compliance/EPIC.md"]
---

# Admin & Metrics MCP Tools

Placeholder for a future MCP server exposing governance/configuration mutation and usage-metrics read tools, for an MCP-capable client acting as a SkillCanon administrator rather than a prompt consumer (e.g. an agent creating/updating policies or objectives, or pulling usage metrics, on a user's behalf). Captured for later scoping — not yet designed in any detail.

## Requirements

- [ ] Not yet scoped — see Open Questions

## Acceptance Criteria

- [ ] Not yet scoped — see Open Questions

## Open Questions

- Full CRUD surface (create/update/delete policies, objectives, teams, API keys) vs. read-mostly (metrics + config visibility, no mutation)?
- Auth model: reuse `authenticateApiKey` with an admin-scoped key, something session-based, or a distinct credential type?
- Should this land as a second MCP server/mount point, or as additional tools on the same `/mcp` mount `008-distribution/002-mcp-server-and-tools.md` specs, if that ever gets built?
- Is MCP even the right transport, or would documented admin REST routes (portable from `008-distribution/001-rest-api-core-routes.md`) serve the same need without standing up a second protocol surface?
- Which entities are in scope first — governance (policies/objectives/teams) only, or also identity-access (API keys, users) and audit-compliance (usage/audit reads)?

## Dependencies

- `backlog/002-identity-access/EPIC.md`
- `backlog/005-governance/EPIC.md`
- `backlog/003-audit-compliance/EPIC.md` (usage metrics)

## Technical Notes

Deliberately unscoped — this file exists so the idea isn't lost, not because scoping work has already happened. Before building, check whether `008-distribution/002-mcp-server-and-tools.md` has been picked back up in the meantime; if so, this may end up as additional tools on that same server rather than a standalone one.
