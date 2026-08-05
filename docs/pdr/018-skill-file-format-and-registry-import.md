# PDR-018: Skill File Format — Markdown + Templates, No Structured Input/Output

**Status:** Accepted
**Date:** 2026-08-05

## Context

A skill's content today is a single flat string per template kind: `promptVersions.systemTemplate`/`userTemplate`, rendered via Nunjucks with `{{var}}` placeholders filled from a caller-supplied `input: Record<string, unknown>` object at `expand()` time. `promptVersions.inputSchema` (JSONB) exists alongside it to describe those variables, but per `bcs/prompt-registry/CONTRACT.md`'s own documented behavior, **it is never validated against caller input** — a deliberate legacy carryover from the original Python system, not an enforced contract.

This doesn't match how skills actually work in Claude Code and similar tools (including this repo's own `.claude/skills/*`): a real skill is a `SKILL.md` (frontmatter `name`/`description` + natural-language instructions) optionally accompanied by reference/template/asset files in the same folder — there is no formal input/output schema a caller fills in. The Skill Sync CLI (`008-distribution/archive/005-skill-sync-cli.md`) already produces real `SKILL.md` stub files, but today's stub body is a fixed one-line pointer ("run `skillcanon run <slug>` and follow the output as instructions") — the actual skill content never becomes a real, readable markdown file; it's resolved into an opaque REST response instead.

## Options Considered

### A — Keep the status quo (structured `input` object, flat template string, unused `input_schema`)
Pros: zero migration cost; nothing breaks.
Cons: `input_schema` is dead weight that's been unvalidated since day one; the flat-string-with-placeholders model has no way to reference a second file (a report template, a checklist, an example) alongside the main instructions, which is a real, recurring need real Claude Code skills already solve; doesn't match the tool's own actual skill convention, which is confusing for anyone authoring a skill who already knows how Claude Code skills work.

### B — Skill becomes markdown + optional template files, structured `input` removed entirely, resolution stays live (chosen)
A skill version's content becomes a required Markdown file (the skill's instructions/prompt, in the author's own words) plus zero or more named template/reference files stored alongside it. `expand()` (and the CLI's `run` command) drop the `input: Record<string, unknown>` parameter entirely — a skill is invoked, not called with arguments; how the caller's actual request gets incorporated is left to the model reading the markdown, the same way a real Claude Code skill works today. `inputSchema` is dropped from the schema. Policy/objective injection is unaffected in *when* it happens — `expand()` still resolves the invoking user's team-chain policies/objectives fresh on every call and weaves them into the response, per [PDR-010](010-skill-based-distribution-not-mcp.md)'s already-accepted live-resolution, fail-closed governance guarantee. Only the *authored content shape* changes (a file bundle instead of one string with placeholders), not when or how often it's resolved.
Pros: matches the real Claude Code skill convention exactly, closing the gap that motivated this decision; enables template/reference files as a first-class, genuinely useful capability; drops genuinely dead code (`input_schema`); doesn't touch PDR-010's governance-freshness commitment at all.
Cons: breaking change to `expand()`'s REST/MCP/CLI contract (the `input` request field goes away) — every existing published skill's content needs a one-time migration from `{{var}}`-templated string to plain markdown; the CLI's stub-generation (`renderStub()`) and the whole `skillcanon run <slug>` "opaque pointer" pattern need reworking to actually sync real file content down, not just a one-line redirect.

### C — Move to fully static, CLI-synced skill files (no live server call at invocation)
Sync the real markdown + template files down to `.claude/skills/` at `skillcanon sync` time; Claude Code reads them directly with zero runtime dependency on SkillCanon being reachable.
Pros: simplest possible invocation path; works offline.
Cons: this is exactly the option PDR-010 already evaluated and rejected under the name "fully static skill files, periodically re-synced" — it breaks the read-fresh, fail-closed governance guarantee (a policy change wouldn't take effect until the next sync; an outage would silently serve stale content instead of failing closed). Nothing about the content-format question changes that tradeoff. Rejected again, for the same reason.

## Decision

**Option B.** A skill version's content becomes:

- **One required Markdown file** — the skill's actual instructions, authored as plain prose the way a real Claude Code `SKILL.md` body is written, not a `{{var}}`-templated string.
- **Zero or more named template/reference files**, stored alongside it, that the markdown may reference by name (a report template, a checklist, an example transcript, etc.) — mirroring how a real Claude Code skill folder bundles reference/asset files next to its `SKILL.md`.

`promptVersions.inputSchema` and the caller-supplied `input` object are removed entirely from `expand()`, `startSkillChainRun`, `advanceSkillChainRun`, the REST expand route, the MCP `sh-run` tool's argument shape, and the CLI's `run` command. Governance's policy/objective injection stays exactly as fresh as it is today — still resolved and woven in on every `expand()` call, per PDR-010 — this decision only changes what's *being* resolved (a markdown+files bundle instead of a template string), never when or how.

This also motivates two new, separately-scoped capabilities that become natural once a skill is a real file bundle rather than an opaque server-rendered string: importing external skills from a public registry/GitHub (`npx skills add`), and scanning an owned repo's own `.claude/`/`.agents/` folders to upload existing local skills into SkillCanon. Both are tracked as their own epic/features (`backlog/013-skill-import-and-external-registries/`), not designed further in this PDR.

## Consequences

- **Positive:** Skill authoring in SkillCanon matches the real Claude Code skill convention exactly; template/reference files become a genuine, usable capability instead of an unmet need; `input_schema`'s dead weight is removed; PDR-010's governance-freshness guarantee is untouched.
- **Negative:** Breaking change to `expand()`'s contract across REST, MCP, and the CLI — every consumer needs updating in the same wave (tracked at `backlog/006-prompt-registry/011-skill-file-format-refactor.md` for the core model/expand change, `backlog/008-distribution/007-skill-file-format-cli-support.md` for the CLI-side stub/sync rework). Every already-published skill version needs a one-time content migration from `{{var}}`-templated string to plain markdown; the migration strategy (auto-convert vs. require re-publish) is an open question for the implementing feature, not resolved here.
- **Risks:** A skill author relying on `{{var}}` substitution today for genuinely dynamic content (not just static instructions) loses that mechanism outright — there is no replacement calling convention, by design (Option A in the original clarifying discussion was explicitly rejected in favor of this). Flag this loudly in the implementing feature's migration UX, since it's a real capability loss for that narrow case, not just a reshaping.
