# Epic 007: Workflow Orchestration

**Priority:** 7
**Status:** not-started
**Goal:** Let a user compose an ordered chain of skills (prompts) into a named, versioned, shareable `Workflow`, and let a caller (Claude Code, another IDE agent, the web UI) walk that chain step by step — resolving each step's prompt via Prompt Registry's `expand()` — while SkillCanon itself never executes a step or sees what a model returned.

## Overview

The smallest of the core-domain epics: Workflow Orchestration has no template-rendering or governance logic of its own, it's pure composition and sequencing on top of an already-proven expansion engine. Originally scoped this epic's runner as a server-side `runWorkflow()` that called `expand()` for every step in one shot and threaded "each step's output" into the next — but SkillCanon never calls an LLM itself (per `docs/architecture.md`), so there is no server-side "output" to thread. Only the calling agent produces that, the same way `expand()` already works for a single skill (`sh-run` resolves a rendered prompt; the IDE's own agent is what actually runs it against a model) — and the same way a Claude Code skill like `/as-finish` pipelines several other skills together entirely within one agent session, with the agent itself carrying context from one step to the next.

So a `Workflow` here is composition metadata (an ordered list of skill references, plus how each step's input variables map from prior steps' outputs) — not an execution engine. Running a workflow is a client-driven loop: the caller asks SkillCanon to resolve step *N*, executes that step itself (against whatever model/agent it's using), then reports back what it needs downstream steps to see before asking for step *N+1*'s resolution. SkillCanon persists the sequence of what it resolved and sent — a genuine audit/debugging improvement over the current Python implementation, which discards even that — but never the model's responses, since it never sees them.

## Features

- [ ] [001 - Workflow Model & CRUD](001-workflow-model-and-crud.md)
- [ ] [002 - Workflow Runner](002-workflow-runner.md)
- [ ] [003 - Workflow Tenant Isolation Tests](003-workflow-tenant-isolation-tests.md)
- [ ] [004 - Workflow Sharing](004-workflow-sharing.md)
- [ ] [005 - Workflow Views UI](005-workflow-views-ui.md)

*Completed features are moved to `archive/` and checked off here.*

## Dependencies

- `backlog/006-prompt-registry/EPIC.md` (workflow steps call `expand()`)
- `backlog/002-identity-access/EPIC.md`
- `backlog/004-app-shell-and-landing/EPIC.md` (feature 005's UI composes into that epic's shell)

## Notes

**Reframed 2026-07-31**: the original version of this epic modeled `runWorkflow()` as a server-side executor that called `expand()` per step and threaded "outputs" forward in one call — contradicting SkillCanon's own architecture (it never calls an LLM, so it can't produce or observe a step's real output). Rewritten around a client-driven, step-at-a-time resolution API instead (see `002-workflow-runner.md`). `src/bcs/workflow-orchestration/CONTRACT.md` and `OWNERSHIP.md` were updated in the same pass to match, since no code exists yet against the old contract — both were still in `Draft` status with only `.gitkeep` placeholders under `application/`/`infrastructure/`/`domain/`.

**Added 2026-07-23**: feature 005 builds this epic's real UI directly, same pattern as `003-audit-compliance/003-audit-log-ui.md` and `005-governance/005-governance-views-ui.md` — but no design mockup exists yet for these pages, so it's currently a stub pending one (see that feature's Open Questions).
