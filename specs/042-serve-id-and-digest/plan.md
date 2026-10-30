# Plan
- Migration 0033: `distribution.prompt_usage.content_digest text` (nullable).
- distribution: `computeContentDigest` (domain); `insert`/`recordPromptUsage` accept `contentDigest`, return the id; `findById` repo + `getServe` (org-scoped) exported from the barrel.
- REST: expand route records digest, returns extra fields; new `GET /api/serves/[serveId]` (skill name via prompt-registry `getPromptById`); error code `SERVE_NOT_FOUND` via `notFoundResponse`.
- MCP `sh-run`: record digest, append serve line.
- CLI: `ExpansionResult` fields; `run` prints serve line to stderr and stores it in the manifest; `readSyncManifest` carries `serves`.
- CONTRACT.md for distribution updated. Tests: unit (digest), route (expand fields, digest stable/changes with policy, GET serve + cross-org 404), mcp, cli manifest; e2e ui-walk REST step asserts fields.
