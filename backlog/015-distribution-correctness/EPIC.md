# Epic 015: Distribution Correctness

**Priority:** 2
**Status:** in-progress
**Goal:** Every way a skill leaves SkillCanon (REST, CLI-synced file, `skillcanon run`, MCP) hands the consumer the same complete, governed content.

## Overview

The 2026-10-29 smoke test fetched three skills over REST, the CLI, MCP and a real MCP client (headless Claude Code). It used a plain skill, one with a supporting file and an `include_prompt`, and a two-step chain. REST `expand`, `skillcanon run` and MCP `sh-run` all returned the composed body with the team policy appended. Headless Claude Code connected and listed, searched and ran skills correctly. The bugs are in the edges below, and most of them sit on the path Claude Code actually uses: the synced `SKILL.md`.

## Features

- [x] [001 - Governance in the Synced File](archive/001-governance-in-synced-file.md)
- [x] [002 - Render Includes Before Sync](archive/002-render-includes-before-sync.md)
- [x] [003 - Chains Over CLI and MCP](archive/003-chains-over-cli-and-mcp.md)
- [x] [004 - MCP Name and Error Consistency](archive/004-mcp-name-and-error-consistency.md)
- [x] [005 - Supporting Files Over REST and MCP](archive/005-supporting-files-over-rest-and-mcp.md)
- [x] [006 - One Model for Project Skills](archive/006-one-model-for-project-skills.md)
- [x] [007 - UI Defects Found in the Smoke Test](archive/007-ui-defects.md)
- [ ] [008 - Invitation Follow-ups](008-invitation-follow-ups.md)
- [ ] [009 - User-Scope Sync](009-user-scope-sync.md)
- [ ] [010 - Literal Braces in Skill Bodies](010-literal-braces-in-skill-bodies.md)

_Completed features are moved to `archive/` and checked off here._

## Dependencies

- `backlog/014-quickstart-reliability/` 002 (the smoke test each fix extends)
