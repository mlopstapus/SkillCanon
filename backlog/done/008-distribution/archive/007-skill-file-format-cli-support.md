---
epic: 008-distribution
feature: 007-skill-file-format-cli-support
status: done
dependencies: ["../006-prompt-registry/011-skill-file-format-refactor.md", "archive/005-skill-sync-cli.md"]
---

# Skill File Format CLI Support

Per [PDR-018](../../docs/pdr/018-skill-file-format-and-registry-import.md): rework `skillcanon sync`'s stub-generation to sync a skill's real markdown content plus its template/reference files into a real `.claude/skills/<slug>/` folder, replacing the current fixed one-line pointer stub (`cli/src/skills/stub.ts`'s `renderStub()` — "run `skillcanon run <slug>` and follow the output as instructions"). This still resolves live per-invocation (`POST /prompts/expand/{name}`, no `input` argument per `006-prompt-registry/011-skill-file-format-refactor.md`) — the CLI syncs the *authored* markdown/template content for local readability and drift-detection, but `skillcanon run` still goes through a live server call to get the policy/objective-woven result at invocation time, exactly as today.

## Requirements

- [x] `skillcanon sync` writes a real `.claude/skills/<slug>/SKILL.md` per skill — frontmatter `name`/`description` from prompt metadata (unchanged), body is the skill's actual authored markdown content (new — no longer a fixed pointer sentence)
- [x] Any template/reference files attached to the skill's active version are synced alongside `SKILL.md` in the same `<slug>/` folder, named as authored
- [x] Content-hash drift detection (`sync-manifest.ts`, existing) extended to cover the new per-file set, not just the single stub file — a local hand-edit to any synced file (SKILL.md or a template) is detected and flagged, never silently overwritten
- [x] `skillcanon run <slug>` still resolves live via `POST /prompts/expand/{name}` with no `input` argument (per the new `expand()` shape) — the synced local files are for the model/author to read directly, not a cache `run` reads from (done as part of `006-prompt-registry/011-skill-file-format-refactor.md` landing — `run`'s own REST call would have silently broken otherwise; `--input` flag removed, `cli/src/http/skillcanon-client.ts`/`cli/src/commands/run.ts` updated to the new `{content}` response shape. `sync`/`stub.ts`/`sync-manifest.ts` — this item's actual scope — are untouched.)
- [x] `CLAUDE.md`/`AGENTS.md` blurb (existing, from `init`) updated to describe the new file-bundle sync behavior, not the old "opaque pointer" framing

## Acceptance Criteria

- [x] After `skillcanon sync`, a skill with two template files produces a `.claude/skills/<slug>/` folder containing `SKILL.md` plus both template files, matching server content exactly
- [x] Hand-editing a synced template file and re-running `sync` is detected and flagged, not silently overwritten — same guarantee `archive/005-skill-sync-cli.md` already proved for the single-file stub, now proven for the multi-file case
- [x] `skillcanon run` continues to reflect the *current* state of any policy/objective attached to the skill on every invocation — unaffected by this feature, reverified by test since the resolution path changes shape (no `input` argument) (`cli/test/commands/run.test.ts`'s "reflects a change in the server's response on the very next call (no caching)" case, updated for the new `{content}` shape)
- [x] A skill with no template files (markdown only) still syncs and runs correctly — the multi-file case is additive, not mandatory

## Open Questions

- Whether `skillcanon run <slug>` should print the live-resolved result, or whether local Claude Code should be pointed at reading the synced `SKILL.md`/templates directly with `run` becoming unnecessary for the common case — decide during planning; either preserves live governance freshness, but they're different UX shapes.

## Dependencies

- `../006-prompt-registry/011-skill-file-format-refactor.md` (this feature is blocked on the new `expand()`/publish shape landing first)
- `archive/005-skill-sync-cli.md` (extends, does not replace, the existing CLI package)

## Technical Notes

Do not weaken the read-fresh, fail-closed governance guarantee `archive/005-skill-sync-cli.md` and [PDR-010](../../docs/pdr/010-skill-based-distribution-not-mcp.md) already committed to — syncing real file content locally is about authoring/readability, not about making `run` a local/cached operation. If the Open Question above resolves toward "Claude reads the synced files directly, no `run` needed," that decision must explicitly reconcile with PDR-010's rejection of "fully static skill files" — don't silently reintroduce what that PDR already rejected.
