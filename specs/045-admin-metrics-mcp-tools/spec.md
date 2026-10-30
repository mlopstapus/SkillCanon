# Feature Specification: Admin & Metrics MCP Tools

**Feature**: `045-admin-metrics-mcp-tools` · **Backlog**: `backlog/012-ai-and-mcp-governance-tools/001-admin-and-metrics-mcp-tools.md` · **Status**: Draft
Questions that only Ben could answer were resolved to the defaults recorded in the backlog file ("Questions for Ben (wave 5)").

## User Scenarios

### US1 — An AI client administers governance (P1)
An admin connects an MCP client with an API key that carries `governance:read` and `governance:write`. The client lists a team's policies and objectives, creates a policy, updates it, deletes it, and does the same for objectives.
**Acceptance**: each tool returns the resulting record as JSON text; a change appears in the web UI and REST; each mutation writes an audit event with transport `mcp`.

### US2 — An AI client reads usage metrics (P2)
A key with `metrics:read` calls `sh-metrics-summary` (optional `from`/`to` dates) and gets the org usage summary the REST metrics route returns.

### US3 — Refusals are clear (P1)
A key missing the scope, a non-admin user, an unknown team/policy/objective, or a bad argument gets a result with `isError: true` and a short message. Nothing is changed.

## Requirements
- **FR-001** Tools `sh-admin-policy-list|create|update|delete`, `sh-admin-objective-list|create|update|delete`, `sh-metrics-summary` are registered on the existing `/mcp` mount (always listed).
- **FR-002** Read tools need `governance:read` (metrics: `metrics:read`); write tools need `governance:write`. A key without it gets `isError`.
- **FR-003** Mutations call the same governance application functions as the REST routes, with the caller as actor, so role rules (admin / team owner) apply unchanged.
- **FR-004** Policies and objectives are team-scoped only over MCP. Teams, users and API keys are not exposed.
- **FR-005** Mutations record audit events with transport `mcp`.
- **FR-006** Domain errors and validation errors return `isError`; unexpected errors are not swallowed.
- **FR-007** No entitlement gating.

## Assumptions
No new migration. Existing tools and their names are unchanged.
