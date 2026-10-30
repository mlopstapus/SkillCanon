---
epic: 012-mcp-admin-tools
feature: 001-admin-and-metrics-mcp-tools
status: done
dependencies: ["backlog/002-identity-access/EPIC.md", "backlog/005-governance/EPIC.md", "backlog/003-audit-compliance/EPIC.md"]
---

# Admin & Metrics MCP Tools

Placeholder for a future MCP server exposing governance/configuration mutation and usage-metrics read tools, for an MCP-capable client acting as a SkillCanon administrator rather than a prompt consumer (e.g. an agent creating/updating policies or objectives, or pulling usage metrics, on a user's behalf). Captured for later scoping — not yet designed in any detail.

## Requirements

- [x] Extra tools on `/mcp`: team policy and objective list/create/update/delete (`sh-admin-*`) and org usage metrics (`sh-metrics-summary`), per the defaults below (spec `specs/045-admin-metrics-mcp-tools`).

## Acceptance Criteria

- [x] Each tool needs its API-key scope; a missing scope, a non-privileged actor, unknown ids and bad arguments return `isError` with no change.
- [x] Mutations go through the governance functions REST uses and record audit events with transport `mcp`.
- [x] Teams, users and API keys are not exposed.

## Open Questions

- Full CRUD surface (create/update/delete policies, objectives, teams, API keys) vs. read-mostly (metrics + config visibility, no mutation)?
- Auth model: reuse `authenticateApiKey` with an admin-scoped key, something session-based, or a distinct credential type?
- Should this land as a second MCP server/mount point, or as additional tools on the same `/mcp` mount `008-distribution/002-mcp-server-and-tools.md` specs, if that ever gets built?
- Is MCP even the right transport, or would documented admin REST routes (portable from `008-distribution/001-rest-api-core-routes.md`) serve the same need without standing up a second protocol surface?
- Which entities are in scope first — governance (policies/objectives/teams) only, or also identity-access (API keys, users) and audit-compliance (usage/audit reads)?

## Questions for Ben (wave 5) — building to these defaults

1. CRUD surface: **default** policies + objectives get create/update/delete (team scope); reads for effective policies/objectives and org usage metrics. Teams, users and API keys are NOT exposed over MCP (an AI client must not mint credentials).
2. Auth: **default** the existing API key. Tools need a `governance:write` / `governance:read` / `metrics:read` scope on the key; the user's real role still decides what governance allows (non-admins are refused by the same functions REST uses).
3. Mount: **default** extra tools on the existing `/mcp` mount, named `sh-admin-*` and `sh-metrics-*`; wrap the same governance/metrics application functions as the REST routes.
4. Paid-tier gating: **default** none for now (billing is deferred); no entitlement flag is added.

## Dependencies

- `backlog/002-identity-access/EPIC.md`
- `backlog/005-governance/EPIC.md`
- `backlog/003-audit-compliance/EPIC.md` (usage metrics)

## Technical Notes

Deliberately unscoped — this file exists so the idea isn't lost, not because scoping work has already happened. Before building, check whether `008-distribution/002-mcp-server-and-tools.md` has been picked back up in the meantime; if so, this may end up as additional tools on that same server rather than a standalone one.
