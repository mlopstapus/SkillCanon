# Epic 008: Distribution

**Priority:** 8
**Status:** not-started
**Goal:** Compose all six prior bounded contexts into the actual external surface — REST API, a Skill Sync CLI for Claude Code, and web UI — so the self-hosted Free tier is fully usable end-to-end. An MCP protocol server remains speced but deprioritized (see Feature 002).

## Overview

Distribution has no domain rules of its own; this epic is entirely about correct composition, protocol translation, and the external interface agents/IDEs actually use to reach governed prompts. That interface is now primarily REST — both directly (`001-rest-api-core-routes.md`) and via `005-skill-sync-cli.md`, which surfaces every governed prompt as a native Claude Code skill backed by a live call to `POST /prompts/expand/{name}` rather than requiring the IDE to be configured as an MCP client. The previously-planned MCP tool contract (`sh-list`, `sh-search`, `sh-context`, `sh-run`, `sh-workflow-list`, `sh-workflow-run`) is deprioritized, not removed — it's still available to port later for a non-skill-capable MCP client or for workflow orchestration's multi-step needs. When REST, Skill Sync CLI, and Web UI ship, the refactor's core-product scope is complete for the self-hosted Free tier; MCP is no longer a blocker for that. Billing (epic 009) is the only thing still missing, and Free-tier self-hosted installs don't need it at all.

## Features

- [ ] [001 - REST API Core Routes](001-rest-api-core-routes.md)
- [ ] [005 - Skill Sync CLI](005-skill-sync-cli.md)
- [ ] [003 - Web UI Shell & Core Pages](003-web-ui-shell-and-core-pages.md)
- [ ] [004 - Usage Telemetry](004-usage-telemetry.md)
- [ ] [002 - MCP Server & Tools](002-mcp-server-and-tools.md) — deprioritized, see file for rationale
- [ ] [006 - Distribution Tenant Isolation Tests](006-distribution-tenant-isolation-tests.md)

*Completed features are moved to `archive/` and checked off here.*

## Dependencies

- `backlog/002-identity-access/EPIC.md`
- `backlog/003-audit-compliance/EPIC.md`
- `backlog/005-governance/EPIC.md`
- `backlog/006-prompt-registry/EPIC.md`
- `backlog/007-workflow-orchestration/EPIC.md`
- `backlog/000-foundations/004-api-and-error-conventions.md`

## Notes

Feature 002 (MCP) carries the highest external-compatibility risk in this epic — any change to tool names or argument shapes breaks every already-configured IDE. Treat it as a strict compatibility port, not a redesign opportunity, if/when it's picked back up.

Feature 002 is deprioritized in favor of Feature 005 (Skill Sync CLI) — the preferred distribution path for Claude Code is now a synced-skill/REST model rather than an MCP-configured IDE. See `005-skill-sync-cli.md` and `002-mcp-server-and-tools.md`'s Technical Notes for the full reasoning.
