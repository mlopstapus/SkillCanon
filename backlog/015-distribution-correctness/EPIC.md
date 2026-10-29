# Epic 015: Distribution Correctness

**Priority:** 2
**Status:** not-started
**Goal:** Every way a skill leaves SkillCanon (REST, CLI-synced file, `skillcanon run`, MCP) hands the consumer the same complete, governed content.

## Overview

The 2026-10-29 smoke test fetched three skills over REST, the CLI, MCP and a real MCP client (headless Claude Code). It used a plain skill, one with a supporting file and an `include_prompt`, and a two-step chain. REST `expand`, `skillcanon run` and MCP `sh-run` all returned the composed body with the team policy appended. Headless Claude Code connected and listed, searched and ran skills correctly. The bugs are in the edges below, and most of them sit on the path Claude Code actually uses: the synced `SKILL.md`.

## Features

- [ ] [001 - Governance in the Synced File](001-governance-in-synced-file.md)
- [ ] [002 - Render Includes Before Sync](002-render-includes-before-sync.md)
- [ ] [003 - Chains Over CLI and MCP](003-chains-over-cli-and-mcp.md)
- [ ] [004 - MCP Name and Error Consistency](004-mcp-name-and-error-consistency.md)
- [ ] [005 - Supporting Files Over REST and MCP](005-supporting-files-over-rest-and-mcp.md)
- [ ] [006 - One Model for Project Skills](006-one-model-for-project-skills.md)
- [ ] [007 - UI Defects Found in the Smoke Test](007-ui-defects.md)

_Completed features are moved to `archive/` and checked off here._

## Dependencies

- `backlog/014-quickstart-reliability/` 002 (the smoke test each fix extends)
