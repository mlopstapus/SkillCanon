---
epic: 006-prompt-registry
feature: 011-skill-file-format-refactor
status: done
dependencies: ["archive/004-expansion-engine.md", "archive/002-prompt-and-version-model.md"]
---

# Skill File Format Refactor

Per [PDR-018](../../docs/pdr/018-skill-file-format-and-registry-import.md): a skill version's content moves from a single flat template string (`systemTemplate`/`userTemplate`, `{{var}}` placeholders filled from a caller-supplied `input` object) to a required Markdown file plus zero or more named template/reference files, matching the real Claude Code skill convention. `inputSchema` (already unvalidated, dead weight) is removed. Resolution stays live per-invocation — this is a content-model change, not a reversal of [PDR-010](../../docs/pdr/010-skill-based-distribution-not-mcp.md)'s governance-freshness guarantee.

## Requirements

- [x] `prompt_versions` schema change: replace `system_template`/`user_template`/`input_schema` with a required markdown content field plus a way to store zero or more named template/reference files per version (new table, e.g. `prompt_version_files`, or a JSONB array of `{name, content}` — decide based on expected file count/size; a new table is likely cleaner for RLS/indexing consistency with this repo's conventions)
- [x] `expand(db, { organizationId, promptName, userId?, projectId?, version? })` — **`input` parameter removed entirely**; returns the resolved markdown content plus applied policies/objectives, still woven in fresh on every call exactly as today
- [x] `publishVersion` accepts the new markdown + files shape for a template-kind version (chain-kind versions, PDR-017, are unaffected — they never used `input`/templates this way)
- [x] `include_prompt('name')` recursive inclusion (existing, `MAX_INCLUDE_DEPTH`-bounded) continues to work against the new markdown content
- [x] Migration path for every already-published version: decide and document whether existing `{{var}}`-templated content is auto-converted (best-effort strip/flatten) or requires an explicit re-publish — this is a real, user-visible capability change (see PDR-018 Consequences), not silent
- [x] Policy/objective injection (prepend/append/inject, tenet-mandated Nunjucks sandboxed rendering per tenet S2) continues to apply to the resolved markdown exactly as it does today to the resolved template

## Acceptance Criteria

- [x] Publishing a skill version with a markdown file plus two template files stores and returns all three correctly
- [x] `expand()` called with no `input` argument at all (the new, only calling shape) still returns policy/objective-woven content, proven by test
- [x] A pre-existing published version (old flat-template shape) still resolves without erroring, per whichever migration strategy is chosen
- [x] `input_schema` column and the `input` parameter are gone from the codebase — no remaining reference outside migration/historical context
- [x] Module-boundary lint and existing `expand-characterization.test.ts`-style equivalence tests are updated to reflect the new shape, not silently left asserting the old one

## Open Questions

- Auto-convert existing published skills' `{{var}}`-templated content on migration, or require every skill owner to re-publish? Affects migration UX and whether a skill silently changes behavior on this feature's release.
- Exact storage shape for template/reference files (new table vs. JSONB array) — decide during planning based on realistic file count/size expectations; no existing precedent in this codebase for a "file bundle attached to a row" pattern.
- Any size/count cap on template/reference files per version, matching the 64 KB opaque-output cap precedent set by `advanceSkillChainRun` (`archive/009-skill-chains.md`).

## Dependencies

- `archive/004-expansion-engine.md`
- `archive/002-prompt-and-version-model.md`
- [PDR-018](../../docs/pdr/018-skill-file-format-and-registry-import.md)

## Technical Notes

This is a breaking change to `expand()`'s contract, consumed by REST (`001-rest-api-core-routes.md`), MCP's `sh-run` (`008-distribution/002-mcp-server-and-tools.md`), and the CLI (`008-distribution/archive/005-skill-sync-cli.md`) — coordinate with `008-distribution/007-skill-file-format-cli-support.md`, which reworks the CLI-side stub/sync mechanism to actually sync real file content instead of a one-line pointer stub. Land the core model/expand change here first; the CLI feature depends on it.
