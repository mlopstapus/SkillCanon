---
epic: 015-distribution-correctness
feature: 005-supporting-files-over-rest-and-mcp
status: done
dependencies: []
---

# Supporting Files Over REST and MCP

`code-review` ships `checklist.md` beside its `SKILL.md`, and its body says "use the checklist in checklist.md". The CLI writes the file to disk; `expand` and `sh-run` return only the main body, so an MCP consumer is told to use a file it can never see.

## Requirements

- [x] `expand` returns `files: [{name, content}]` beside `content`.
- [x] MCP `sh-run` returns them as additional content blocks or embedded resources.
