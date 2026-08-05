# Epic 008: Distribution

**Priority:** 8
**Status:** in-progress
**Goal:** Compose all six prior bounded contexts into the actual external surface — REST API, a Skill Sync CLI for Claude Code, and web UI — so the self-hosted Free tier is fully usable end-to-end. An MCP protocol server remains speced but deprioritized (see Feature 002).

## Overview

Distribution has no domain rules of its own; this epic is entirely about correct composition, protocol translation, and the external interface agents/IDEs actually use to reach governed prompts. That interface is now primarily REST — both directly (`001-rest-api-core-routes.md`) and via `005-skill-sync-cli.md`, which surfaces every governed prompt as a native Claude Code skill backed by a live call to `POST /prompts/expand/{name}` rather than requiring the IDE to be configured as an MCP client. The previously-planned MCP tool contract (`sh-list`, `sh-search`, `sh-context`, `sh-run`, `sh-workflow-list`, `sh-workflow-run`) is deprioritized, not removed — it's still available to port later for a non-skill-capable MCP client or for workflow orchestration's multi-step needs. When REST, Skill Sync CLI, and Web UI ship, the refactor's core-product scope is complete for the self-hosted Free tier; MCP is no longer a blocker for that. Billing (epic 009) is the only thing still missing, and Free-tier self-hosted installs don't need it at all.

## Features

- [x] [001 - REST API Core Routes](archive/001-rest-api-core-routes.md)
- [x] [005 - Skill Sync CLI](archive/005-skill-sync-cli.md)
- [ ] [003 - Web UI Shell & Core Pages](003-web-ui-shell-and-core-pages.md) — policy/objective UI gap closed 2026-08-05, remaining smoke-test steps not yet verified, see file
- [x] [004 - Usage Telemetry](archive/004-usage-telemetry.md)
- [ ] [002 - MCP Server & Tools](002-mcp-server-and-tools.md) — deprioritized (see file), plus a real test-coverage gap found 2026-08-05
- [x] [006 - Distribution Tenant Isolation Tests](archive/006-distribution-tenant-isolation-tests.md)
- [ ] [007 - Skill File Format CLI Support](007-skill-file-format-cli-support.md)

*Completed features are moved to `archive/` and checked off here.*

## Dependencies

- `backlog/002-identity-access/EPIC.md`
- `backlog/003-audit-compliance/EPIC.md`
- `backlog/005-governance/EPIC.md`
- `backlog/006-prompt-registry/EPIC.md` (includes skill chains — see [PDR-017](../../docs/pdr/017-fold-workflow-orchestration-into-prompt-registry.md))
- `backlog/000-foundations/004-api-and-error-conventions.md`

## Notes

Feature 002 (MCP) carries the highest external-compatibility risk in this epic — any change to tool names or argument shapes breaks every already-configured IDE. Treat it as a strict compatibility port, not a redesign opportunity, if/when it's picked back up.

Feature 002 is deprioritized in favor of Feature 005 (Skill Sync CLI) — the preferred distribution path for Claude Code is now a synced-skill/REST model rather than an MCP-configured IDE. See `archive/005-skill-sync-cli.md` and `002-mcp-server-and-tools.md`'s Technical Notes for the full reasoning.

**Status check (2026-08-05):** 001, 004, 005, 006 verified genuinely complete and archived. This epic is **not** fully done: feature 003's policy/objective UI gap closed the same day (`backlog/005-governance/archive/005-governance-views-ui.md` shipped), but its own Acceptance Criteria's full end-to-end smoke test still hasn't been run — left `open`; feature 002 is real code but has an unverified-by-test gap (a spec claims coverage from a test file that doesn't exist), also left `open` with the gap documented in its own file rather than force-completed.

**Reopened (PDR-018):** new feature 007 — the CLI's skill-stub content model (built by archived feature 005) is being reworked from a fixed one-line pointer stub into a real markdown-plus-templates sync, matching prompt-registry's new skill file format (`backlog/006-prompt-registry/011-skill-file-format-refactor.md`). See [PDR-018](../../docs/pdr/018-skill-file-format-and-registry-import.md).
