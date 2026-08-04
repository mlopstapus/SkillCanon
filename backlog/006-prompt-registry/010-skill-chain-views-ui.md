---
epic: 006-prompt-registry
feature: 010-skill-chain-views-ui
status: open
dependencies: ["archive/009-skill-chains.md", "backlog/004-app-shell-and-landing/002-app-shell-and-navigation.md"]
supersedes: ["backlog/007-workflow-orchestration/005-workflow-views-ui.md"]
---

# Skill Chain Views UI

The real, finished UI for creating and viewing chain-kind skills, composed into Prompt Registry's existing pages rather than a separate `/workflows/*` route tree — since, per [PDR-017](../../docs/pdr/017-fold-workflow-orchestration-into-prompt-registry.md), a chain is a `Prompt`/`PromptVersion` like any other, not a distinct entity with its own page family.

**Status: no Claude design mockup exists yet for these pages** (carried over unresolved from `007-workflow-orchestration/005-workflow-views-ui.md`). Pull the corresponding mockup(s) via the `claude_design` MCP server first and run the same gap-analysis pass against `archive/009-skill-chains.md` before finalizing this file's Requirements — don't invent them from a description.

## Requirements

- [ ] Pull the skill-chain mockup(s) from claude.ai/design before finalizing the rest of this list.
- [ ] A skill's detail page (already built by `archive/006-prompt-registry-views-ui.md`) surfaces whichever kind of version it has — template versions render as today; a chain version's step list (id, `promptName`, `promptVersion`, `dependsOn`) is shown instead of template content.
- [ ] A way to author a new chain version (step list builder) alongside the existing template-version publish flow.
- [ ] A run-history view, sourced entirely from `listSkillChainRuns`/`getSkillChainRun` (`archive/009-skill-chains.md`) — resolved step content (`system_message`/`user_message`) and each step's caller-self-reported status. There is no "run" action anywhere in this UI; the web UI never calls `startSkillChainRun`/`advanceSkillChainRun` and has no way to show a model's actual response, since Prompt Registry itself never receives one — real runs happen entirely client-side in whatever agent (Claude Code, another IDE) is executing the chain.

## Acceptance Criteria

- [ ] Publish a chain version and view its run history step by step, works end-to-end through this UI.
- [ ] Step sequencing and each step's self-reported status are clearly legible; the UI never implies it is showing a model's real response, and exposes no control that starts or advances a run.
- [ ] The page(s) visually match whatever mockup is pulled in.
- [ ] Template-version and chain-version skills are both browsable from the same skill list/detail pages — no separate "workflows" navigation entry.

## Open Questions

- Which mockup file(s) cover these pages — none were found alongside the existing Prompts/Projects mockups as of 2026-08-01 (carried over from the predecessor feature).

## Dependencies

- `archive/009-skill-chains.md`
- `backlog/004-app-shell-and-landing/EPIC.md`

## Technical Notes

Confirmed: this page is read-only history, not a run trigger. Per `archive/009-skill-chains.md`, Prompt Registry never executes a step or observes a model's output — this page can only present what was resolved/sent per step and what the calling agent self-reported, never a real model response. Uses `listSkillChainRuns`/`getSkillChainRun` only; never `startSkillChainRun`/`advanceSkillChainRun`.
