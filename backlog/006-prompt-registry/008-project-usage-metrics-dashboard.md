---
epic: 006-prompt-registry
feature: 008-project-usage-metrics-dashboard
status: open
dependencies: ["006-prompt-registry-views-ui.md"]
---

# Project Usage Metrics Dashboard

Deferred out of `006-prompt-registry-views-ui` during `/speckit-specify` (2026-07-31): the `SkillCanon Prompts.dc.html` mockup's Project Detail page includes a full "Metrics" tab — total invocations, active skills/contributors, required-skill coverage (with gap call-outs for branches/contributors missing a required prompt), a 14-day invocation trend, and usage broken down by skill/branch/member. All of it is computed from a per-invocation usage log (which prompt ran, in which project/repo/branch, by which user, when) that no existing epic captures yet.

Building the dashboard UI without that underlying capture would mean either inventing new usage-tracking as an undocumented side effect of a "views UI" feature, or shipping a dashboard with no real data behind it — both rejected per this repo's "no half-finished implementations" tenet. See `specs/023-prompt-registry-views-ui/spec.md`'s Assumptions section for the full reasoning.

## Requirements

- [ ] Decide where invocation/usage events are captured (likely the expansion engine's `expand()` call path, and/or the VCS integration epic's PR-check flow — whichever actually knows project/repo/branch context at call time) and land the schema for a usage-log/invocation-event table
- [ ] `prompt_registry` (or a dedicated usage-tracking) capability to record: prompt id, project id, acting user id, repo id, branch, timestamp — one row per expansion/invocation
- [ ] Project Detail "Metrics" tab UI, matching the mockup: 4 summary tiles (total invocations, active skills, active contributors, required-skill coverage), gap panels (branches missing a required skill; contributors not using a required skill; or an all-clear banner), a 14-day invocation trend chart, and usage tables by skill / by branch / by member

## Acceptance Criteria

- [ ] Every invocation of a prompt within a project's context is recorded with enough context (repo, branch, user) to power the mockup's coverage/gap calculations
- [ ] Required-skill coverage and gap panels match the mockup's logic: a branch or member is only flagged if the project has at least one required prompt and that prompt has zero recorded usage from that branch/member
- [ ] The dashboard reflects real recorded usage, not placeholder/sample data

## Open Questions

- Does invocation usage get captured at expansion time (the expansion engine itself), at VCS-integration PR-check time (only when there's a real repo/branch context), or both? This determines whether personal/ad hoc expansions (no project/repo context) show up anywhere in this dashboard at all.

## Dependencies

- `006-prompt-registry-views-ui.md` (this dashboard was originally scoped as part of that feature's mockup; split out here)
- Likely `backlog/011-vcs-integration/EPIC.md` (repo/branch context for usage attribution)

## Technical Notes

`specs/023-prompt-registry-views-ui/spec.md`'s Assumptions section documents the exact mockup section this was cut from (`showPjMetrics`/`pd.metrics.*` in `SkillCanon Prompts.dc.html`) and the sample usage-log shape the mockup's own placeholder data used (`promptId`, `projectId`, `userId`, `repoId`, `branch`, `ts`) — a reasonable starting point for the real schema, not a spec.
