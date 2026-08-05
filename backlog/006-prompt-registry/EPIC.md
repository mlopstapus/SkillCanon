# Epic 006: Prompt Registry

**Priority:** 6
**Status:** in-progress
**Goal:** Port Project, Prompt (skill ownership, subscribe/fork sharing), PromptVersion, and the expansion engine — the second core-domain context — consuming Governance strictly through its read contract, not its internals. Also owns project-skill assignment (required/optional), a capability with no Python precedent, added by [PDR-016](../../docs/pdr/016-skill-ownership-sharing-and-project-assignment.md).

## Overview

The expansion engine (`expand_prompt` in the current Python code) is the other high-risk port alongside Governance's resolution engine — it combines template rendering, recursive prompt-inclusion resolution, and a call into Governance, and today that Governance call reaches somewhat informally into policy/objective services. This epic is where tenet D1 gets proven under real pressure: the temptation to take a shortcut and import Governance's internals for convenience is highest here, precisely because the current Python code already does that.

A skill (the `Prompt` aggregate) is owned by exactly one user or exactly one team, never derived from a project — sharing (subscribe/fork), project usage (assignment), and ownership are three independent concerns. See PDR-016 for the full model and why the originally-speced `Policy.enforcementType: "require-skill"`/`resolveRequiredSkillPolicies` design moved out of Governance and into this epic instead (feature 007).

## Features

- [x] [001 - Project Model & Membership](archive/001-project-model-and-membership.md)
- [x] [002 - Prompt & Version Model](archive/002-prompt-and-version-model.md)
- [x] [003 - Skill Sharing — Subscribe & Fork](archive/003-prompt-sharing.md)
- [x] [004 - Expansion Engine](archive/004-expansion-engine.md)
- [x] [005 - Prompt Registry Tenant Isolation Tests](archive/005-prompt-registry-tenant-isolation-tests.md)
- [x] [006 - Prompt Registry Views UI](archive/006-prompt-registry-views-ui.md)
- [x] [007 - Project Skill Assignment](archive/007-project-skill-assignment.md)
- [x] [008 - Project Usage Metrics Dashboard](archive/008-project-usage-metrics-dashboard.md)
- [x] [009 - Skill Chains](archive/009-skill-chains.md)
- [x] [010 - Skill Chain Views UI](archive/010-skill-chain-views-ui.md)
- [ ] [011 - Skill File Format Refactor](011-skill-file-format-refactor.md)

*Completed features are moved to `archive/` and checked off here.*

## Dependencies

- `backlog/005-governance/EPIC.md` (expansion depends on Governance's resolution contract; no longer depends on Governance for required-skill resolution — see PDR-016)
- `backlog/002-identity-access/EPIC.md`
- `backlog/003-audit-compliance/001-audit-event-schema-and-write-path.md`
- `backlog/004-app-shell-and-landing/EPIC.md` (feature 006's UI composes into that epic's shell)

## Notes

Feature 004 must call Governance only through `resolveEffectivePolicies`/`resolveAllPolicies`/`resolveEffectiveObjectives` — reaching into `governance.*` tables directly from this BC is a direct tenet D1 violation and should fail the module-boundary lint check built in epic 001.

**Added 2026-07-23**: feature 006 builds this epic's real UI directly, same pattern as `003-audit-compliance/003-audit-log-ui.md` and `005-governance/005-governance-views-ui.md` — but no design mockup exists yet for these pages, so it's currently a stub pending one (see that feature's Open Questions).

**Added 2026-07-29 (PDR-016)**: feature 007 is new — project-skill assignment (required/optional) was originally speced as a Governance policy (`backlog/011-vcs-integration/003-required-skill-governance-policy.md`) before ownership/sharing design work showed governance should never be project-scoped. `backlog/011-vcs-integration/003` and `005` now depend on this epic's feature 007 instead of Governance.

**Added 2026-07-30**: feature 007 (`022-project-skill-assignment`) also delivered feature 001's remaining, still-unbuilt collaborator-team capability (`project_teams`) as part of its own scope — `007`'s acceptance criteria were untestable without it, and `001` had sat with that piece unbuilt since PDR-016 added it. Both features are now fully closed and archived; `001`'s own file records exactly which requirements came from which delivery.

**Added 2026-07-31**: feature 006's `/speckit-specify` pass (`specs/023-prompt-registry-views-ui/`) found the `SkillCanon Prompts.dc.html` mockup's Project Detail page includes a full usage/invocation-metrics dashboard with no backing usage-log capability anywhere in the codebase yet. Split it out as new feature 008 rather than building it half-finished (no real data) or silently inventing usage-tracking as a side effect of a views-UI feature — see `008`'s Technical Notes for the exact mockup section it came from.

**Completed 2026-07-31**: feature 006 shipped via the full speckit loop (`specs/023-prompt-registry-views-ui/`), which also caught and fixed feature 005 sitting fully-shipped-but-unarchived since `022-prompt-registry-tenant-isolation` landed — another instance of this epic's recurring backlog-lags-code pattern (see feature 001/007's note above). Both are now archived. Only feature 008 (metrics dashboard) remains open in this epic.

**Added 2026-08-01 ([PDR-017](../../docs/pdr/017-fold-workflow-orchestration-into-prompt-registry.md))**: `backlog/007-workflow-orchestration/` is retired and folded into this epic as features 009-010. A "workflow" was never a distinct domain concept — it's a `PromptVersion` whose content is an ordered step list instead of a template. Feature 009 carries forward `007-workflow-orchestration/001-workflow-model-and-crud.md` (already shipped, now being reworked in place rather than left running as a separate BC) and `002-workflow-runner.md` (never implemented, only speced at `specs/025-workflow-runner`, now superseded). `007-workflow-orchestration/004-workflow-sharing.md`'s entire scope turned out to already be satisfied by this epic's existing `subscribeSkill`/`forkSkill` — no replacement item needed for it, since a chain is a skill and sharing already works generically over any `Prompt`. `007-workflow-orchestration/003-workflow-tenant-isolation-tests.md`'s scope is folded into feature 009's own requirements (new tables get RLS from the start, no separate follow-up).

**Completed 2026-08-05**: Feature 010 confirmed fully shipped (`specs/028-skill-chain-views-ui/`, merged via PR #57) — another instance of the backlog-lags-code pattern noted above (tracked open in this file despite being done). With 001-010 all archived, this epic was fully complete as originally scoped.

**Reopened 2026-08-05 (PDR-018)**: New feature 011 adds a real, user-driven scope change — skills drop the vestigial `input_schema`/structured-`input` calling convention entirely (never validated, legacy carryover) and move from a single flat template string to a required Markdown file plus optional accompanying template/reference files, matching the real Claude Code skill convention rather than SkillCanon's own bespoke one. `expand()` keeps resolving live per-invocation (policy/objective injection stays fresh on every call, per [PDR-010](../../docs/pdr/010-skill-based-distribution-not-mcp.md)) — only the authored content shape and calling convention change, not when/how a skill is resolved. See [PDR-018](../../docs/pdr/018-skill-file-format-and-registry-import.md) for the full decision. This epic is in-progress again until 011 ships; a corresponding Distribution-side feature (CLI stub/sync rework) is tracked at `backlog/008-distribution/007-skill-file-format-cli-support.md`.
