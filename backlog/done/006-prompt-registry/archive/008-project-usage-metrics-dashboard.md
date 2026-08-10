---
epic: 006-prompt-registry
feature: 008-project-usage-metrics-dashboard
status: done
dependencies: ["archive/006-prompt-registry-views-ui.md", "../008-distribution/004-usage-telemetry.md"]
---

# Project Usage Metrics Dashboard

Deferred out of `006-prompt-registry-views-ui` during `/speckit-specify` (2026-07-31): the `SkillCanon Prompts.dc.html` mockup's Project Detail page includes a full "Metrics" tab — total invocations, active skills/contributors, required-skill coverage (with gap call-outs for branches/contributors missing a required prompt), a 14-day invocation trend, and usage broken down by skill/branch/member. All of it is computed from a per-invocation usage log (which prompt ran, in which project/repo/branch, by which user, when) that no existing epic captures yet.

Building the dashboard UI without that underlying capture would mean either inventing new usage-tracking as an undocumented side effect of a "views UI" feature, or shipping a dashboard with no real data behind it — both rejected per this repo's "no half-finished implementations" tenet. See `specs/023-prompt-registry-views-ui/spec.md`'s Assumptions section for the full reasoning.

**Design session (2026-08-01) resolved the capture strategy — see Technical Notes for the full schema/query design.** Key outcome: this feature pulls forward part of `008-distribution/004-usage-telemetry.md` (the `distribution.prompt_usage` table, still `status: open`/not built) rather than inventing a parallel `prompt_registry`-owned usage table — `prompt_usage` is already the documented home for invocation telemetry, and is the same table `011-vcs-integration`'s CLI git-context feature plans to extend later with `git_remote_url`/`git_branch`/`git_commit_sha`. Documented on both sides per this repo's pull-forward convention — see the matching note added to `008-distribution/004-usage-telemetry.md`.

## Requirements

- [X] Extend `distribution.prompt_usage` (pulling forward from `008-distribution/004-usage-telemetry.md`, still open) with the attribution columns this dashboard needs: `organization_id`, `prompt_id`, `prompt_version_id`, `project_id` (nullable), `user_id` (nullable), `created_at`. **Delivered differently than originally drafted here**: `004`'s originally-planned `prompt_name`/`prompt_version` strings and `status_code`/`latency_ms` columns were *not* added — nothing populates or reads them yet, and adding unpopulated columns would have been building for a hypothetical need. Those remain `004`'s to add when it actually starts.
- [X] `distribution.recordPromptUsage(...)` exists as an exposed function. **Resolved differently than originally drafted here, via `/speckit-clarify`**: it is explicitly *not* called from `src/app/(app)/prompts/[name]/page.tsx`'s live-preview route or anywhere else in production code — test/preview invocations must never count as usage (spec FR-002a of `specs/024-project-usage-metrics-dashboard/`). No genuine (non-test) caller of `expand()` exists anywhere in the codebase yet; every project correctly shows "no usage yet" until `008-distribution` ships a real invocation transport (CLI/REST/MCP). Proven by a permanent regression test (`expand.test.ts`) asserting `expand()` never produces a `prompt_usage` row. No event-bus infrastructure exists anywhere in this codebase, so despite `PromptExpanded` being documented as an "event" in both BCs' `CONTRACT.md`, the real implementation is a direct cross-BC function call through Distribution's public barrel — the same pattern already established for `audit-compliance`'s `record()`.
- [X] Every `expand()` call is recorded regardless of whether `projectId` is present — `project_id` is nullable, ad hoc/personal expansions still get a row, just excluded from this project-scoped dashboard's queries (`WHERE project_id = :id`). Keeps the door open for a future personal-usage view with zero re-capture work.
- [X] Project Detail "Metrics" tab UI, scoped to what's actually buildable from this data:
  - 4 summary tiles: total invocations (all-time), active skills (rolling 30-day distinct prompts), active contributors (rolling 30-day distinct users, excluding null `user_id`), required-skill coverage (rolling 30-day, see Acceptance Criteria)
  - Gap panel: project members not using a required skill (all `project_members` rows checked against all `required` `project_skill_assignments`, 30-day window) — **no branch-level gap panel** (cut, see below)
  - 14-day invocation trend as a **stacked bar chart**, one series per skill/prompt, x-axis = day, zero-filled for days with no invocations
  - Usage-by-skill table (all-time, grouped by `prompt_id`)
  - Usage-by-member table (all-time, grouped by `user_id`, with a separate "no user" bucket for ungoverned invocations) — **no usage-by-branch table** (cut, see below)
- [X] **Branch-level metrics (gap panel + usage-by-branch table) are cut from this feature entirely** — `expand()` has no repo/branch parameters today and its only real caller doesn't have that context either; repo/branch only becomes available once `011-vcs-integration/004-cli-git-context-tagging-and-usage-query-api.md` adds `git_remote_url`/`git_branch`/`git_commit_sha` to this same `prompt_usage` table. Revisit then, as a follow-up to this feature, not a new invention.

## Acceptance Criteria

- [X] Every invocation of a prompt (via `expand()`) is recorded on `distribution.prompt_usage` with `organization_id`, `prompt_id`, `prompt_version_id`, `user_id` (nullable), and `project_id` (nullable) — true of every *genuine* invocation; no genuine caller exists yet, so this is verified via direct fixture-seeded tests, not a live end-to-end call (see above)
- [X] Required-skill coverage and the gap panel check **every** `project_members` row against **every** `required` `project_skill_assignments` row for that project, within a rolling 30-day window — a member with zero recorded usage of a required skill in the last 30 days is a gap, even if they've never used anything else in the project either
- [X] The 14-day trend renders as a stacked bar chart (one segment per skill), not a single aggregate line — matches the explicit chart-type decision from this feature's design discussion
- [X] The dashboard reflects real recorded usage, not placeholder/sample data
- [X] A project with zero recorded usage shows a real empty state, not a broken chart/table

## Open Questions

- ~~Does the prompt detail page's live-preview "test this prompt" flow count as real project usage for this dashboard?~~ **Resolved via `/speckit-clarify` (2026-08-01): no — test/preview invocations must never count as usage, under any circumstance.** See requirements above.

## Dependencies

- `006-prompt-registry-views-ui.md` (archived — this dashboard was originally scoped as part of that feature's mockup; split out here)
- `008-distribution/004-usage-telemetry.md` (still open — this feature pulls forward its core `prompt_usage` table/columns; see that item's own Technical Notes for what's pulled forward vs. still owned there)
- `011-vcs-integration/004-cli-git-context-tagging-and-usage-query-api.md` — not a blocking dependency (branch metrics are cut from this feature's scope), but the natural follow-up once it lands, since it extends the same table this feature stands up

## Technical Notes

**Delivered 2026-08-01** by `specs/024-project-usage-metrics-dashboard/` (branch `024-project-usage-metrics-dashboard`): `src/bcs/distribution/{domain,infrastructure,application}/*prompt-usage*` (first real code in that BC), `src/bcs/prompt-registry/application/get-project-metrics.ts`, and the Metrics tab in `src/app/(app)/projects/[id]/`. Migration `0022_distribution_prompt_usage.sql`. Filed `backlog/008-distribution/006-distribution-tenant-isolation-tests.md` for the resulting no-RLS gap on the new table.

`specs/023-prompt-registry-views-ui/spec.md`'s Assumptions section documents the exact mockup section this was cut from (`showPjMetrics`/`pd.metrics.*` in `SkillCanon Prompts.dc.html`).

**Finalized query semantics** (design session 2026-08-01):

| Element | Query | Window |
|---|---|---|
| Total invocations | `COUNT(*) WHERE project_id = :id` | all-time |
| Active skills | `COUNT(DISTINCT prompt_id) WHERE project_id = :id AND created_at >= now() - 30d` | 30d rolling |
| Active contributors | `COUNT(DISTINCT user_id) WHERE project_id = :id AND user_id IS NOT NULL AND created_at >= now() - 30d` | 30d rolling |
| Required-skill coverage | of (all `project_members` × required `project_skill_assignments`) pairs, % with ≥1 matching `prompt_usage` row | 30d rolling |
| Gap panel (members) | member/required-skill pairs with zero matching rows | 30d rolling |
| 14-day trend | daily `COUNT(*)` per `prompt_id`, via `date_trunc('day', created_at)`, zero-filled | 14d |
| Usage by skill | `GROUP BY prompt_id, COUNT(*)` | all-time |
| Usage by member | `GROUP BY user_id, COUNT(*)`, null-`user_id` rows bucketed as "no user" | all-time |

Same table also enables (not in scope here, noted for future features only): version-adoption lag using `prompt_version_id` (e.g. invocations still on a rolled-back version), staleness-based coverage instead of a hard 30-day cutoff, and cross-project/org-wide leaderboards.
