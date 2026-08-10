# Epic 008: Distribution

**Priority:** 8
**Status:** done
**Goal:** Compose all six prior bounded contexts into the actual external surface — REST API, a Skill Sync CLI for Claude Code, and web UI — so the self-hosted Free tier is fully usable end-to-end. An MCP protocol server remains speced but deprioritized (see Feature 002).

## Overview

Distribution has no domain rules of its own; this epic is entirely about correct composition, protocol translation, and the external interface agents/IDEs actually use to reach governed prompts. That interface is now primarily REST — both directly (`001-rest-api-core-routes.md`) and via `005-skill-sync-cli.md`, which surfaces every governed prompt as a native Claude Code skill backed by a live call to `POST /prompts/expand/{name}` rather than requiring the IDE to be configured as an MCP client. The previously-planned MCP tool contract (`sh-list`, `sh-search`, `sh-context`, `sh-run`, `sh-workflow-list`, `sh-workflow-run`) is deprioritized, not removed — it's still available to port later for a non-skill-capable MCP client or for workflow orchestration's multi-step needs. When REST, Skill Sync CLI, and Web UI ship, the refactor's core-product scope is complete for the self-hosted Free tier; MCP is no longer a blocker for that. Billing (epic 009) is the only thing still missing, and Free-tier self-hosted installs don't need it at all.

## Features

- [x] [001 - REST API Core Routes](archive/001-rest-api-core-routes.md)
- [x] [005 - Skill Sync CLI](archive/005-skill-sync-cli.md)
- [x] [003 - Web UI Shell & Core Pages](archive/003-web-ui-shell-and-core-pages.md) — re-verified and closed 2026-08-10 via `specs/035-web-ui-final-audit/`; also found and fixed a stale-migration environment issue on the shared dev stack, see file
- [x] [004 - Usage Telemetry](archive/004-usage-telemetry.md)
- [x] [002 - MCP Server & Tools](archive/002-mcp-server-and-tools.md) — deprioritized as the primary distribution path (see file), but fully built and verified; test-coverage gap closed 2026-08-05 (also found and fixed a real cross-session auth-bypass bug), remaining 2 Acceptance Criteria (characterization equivalence, restart mid-session) closed 2026-08-09
- [x] [006 - Distribution Tenant Isolation Tests](archive/006-distribution-tenant-isolation-tests.md)
- [x] [007 - Skill File Format CLI Support](archive/007-skill-file-format-cli-support.md)
- [x] [008 - MCP Session Cleanup Scheduling](archive/008-mcp-session-cleanup-scheduling.md) — minor, low-priority resource-hygiene gap found alongside 002's fix, closed 2026-08-09

*Completed features are moved to `archive/` and checked off here.*

## Dependencies

- `backlog/002-identity-access/EPIC.md`
- `backlog/003-audit-compliance/EPIC.md`
- `backlog/005-governance/EPIC.md`
- `backlog/006-prompt-registry/EPIC.md` (includes skill chains — see [PDR-017](../../docs/pdr/017-fold-workflow-orchestration-into-prompt-registry.md))
- `backlog/000-foundations/004-api-and-error-conventions.md`

## Notes

Feature 002 (MCP) carries the highest external-compatibility risk in this epic — any change to tool names or argument shapes breaks every already-configured IDE. Treat it as a strict compatibility port, not a redesign opportunity, if/when it's picked back up.

Feature 002 is deprioritized in favor of Feature 005 (Skill Sync CLI) — the preferred distribution path for Claude Code is now a synced-skill/REST model rather than an MCP-configured IDE. See `archive/005-skill-sync-cli.md` and `archive/002-mcp-server-and-tools.md`'s Technical Notes for the full reasoning.

**Status check (2026-08-05):** 001, 004, 005, 006 verified genuinely complete and archived. This epic is **not** fully done: feature 003's policy/objective UI gap closed the same day (`backlog/005-governance/archive/005-governance-views-ui.md` shipped), but its own Acceptance Criteria's full end-to-end smoke test still hasn't been run — left `open`; feature 002 is real code but has an unverified-by-test gap (a spec claims coverage from a test file that doesn't exist), also left `open` with the gap documented in its own file rather than force-completed.

**Status check (2026-08-09):** feature 002's two remaining Acceptance Criteria (characterization equivalence, restart mid-session) closed and verified by test — see `archive/002-mcp-server-and-tools.md`'s own update. Feature 008 (session cleanup scheduling) also closed the same day — see `archive/008-mcp-session-cleanup-scheduling.md`. This epic is still not fully done: feature 003's full legacy-parity audit remains open.

**Reopened (PDR-018):** new feature 007 — the CLI's skill-stub content model (built by archived feature 005) is being reworked from a fixed one-line pointer stub into a real markdown-plus-templates sync, matching prompt-registry's new skill file format (`backlog/006-prompt-registry/011-skill-file-format-refactor.md`). See [PDR-018](../../docs/pdr/018-skill-file-format-and-registry-import.md).

**Closed (2026-08-10):** feature 003 (the epic's last open item) re-verified and closed via `specs/035-web-ui-final-audit/` — all 8 features now archived. This epic is fully done.
