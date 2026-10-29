---
epic: 015-distribution-correctness
feature: 004-mcp-name-and-error-consistency
status: open
dependencies: []
---

# MCP Name and Error Consistency

## Requirements

- [ ] `sh-search` returns names prefixed `sh-` (`sh-release-notes`), and `sh-run` rejects them ("not found or not shared with you"). Return the bare name, or accept both. A model that copies the name from a search result fails today. Headless Claude Code got lucky by taking the name from `sh-list`.
- [ ] Tool failures set `isError: true` in the result instead of returning an `Error:` string as normal content.
- [ ] `sh-search` shows `[tags: none]` for a skill created with tags; skill-level tags and version tags need one meaning.
- [ ] The server `instructions` still say "prompt" and "workflow"; align with "skill" and "chain".
