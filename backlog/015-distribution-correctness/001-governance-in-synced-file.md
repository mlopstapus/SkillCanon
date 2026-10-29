---
epic: 015-distribution-correctness
feature: 001-governance-in-synced-file
status: open
dependencies: []
---

# Governance in the Synced File

`skillcanon sync` writes the raw skill body to `.claude/skills/skillcanon-<slug>/SKILL.md`. That file is what Claude Code loads, and it has no policies or objectives in it. Only `skillcanon run` and MCP apply them. So in the main path, governance does not reach the model. PDR-010 assumed the opposite.

## Requirements

- [ ] Decide in a PDR: (a) the synced file is a stub that tells the agent to run `skillcanon run <slug>` (as chains already do), keeping governance live; or (b) sync bakes in the effective policies at sync time, accepting staleness bounded by the SessionStart hook.
- [ ] Whichever is chosen, the smoke test asserts a team policy's text reaches what Claude Code loads.

## Open Questions

- Option (a) costs a tool call per skill use and needs the CLI on `PATH` (see 014/003). Option (b) breaks live governance between syncs. (a) matches the product's promise.
