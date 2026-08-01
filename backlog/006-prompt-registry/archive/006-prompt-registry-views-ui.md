---
epic: 006-prompt-registry
feature: 006-prompt-registry-views-ui
status: done
dependencies: ["004-expansion-engine.md", "005-prompt-registry-tenant-isolation-tests.md", "backlog/004-app-shell-and-landing/002-app-shell-and-navigation.md"]
---

# Prompt Registry Views UI

The real, finished prompts + projects UI — owned by this BC per `bcs/prompt-registry/OWNERSHIP.md` (`src/app/(app)/prompts/*`, `/projects/*`) — built directly against the real `SkillCanon Prompts.dc.html` mockup (claude.ai/design project `7babdbf3-c063-46b5-84df-ffa9f588d88a`, via the `claude_design` MCP server), mirroring `003-audit-compliance/003-audit-log-ui.md`'s and `005-governance/005-governance-views-ui.md`'s pattern: composed into the shared shell from `004-app-shell-and-landing/002-app-shell-and-navigation.md`, with real, finished design applied directly rather than deferred to a later redesign pass.

**Completed 2026-07-31** via the full `/speckit-specify` → `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze` → `/speckit-implement` loop on branch `023-prompt-registry-views-ui` — see `specs/023-prompt-registry-views-ui/`. Three genuinely new backend capabilities were added along the way (`reactivatePrompt`, project-as-subscriber sharing, `project_repos` CRUD + RLS), plus two pre-existing audit-logging gaps fixed (`deprecatePrompt`/`rollbackPrompt` had no audit trail at all before this feature became their first real caller). Verification: `pnpm build` succeeds (all four new routes compile as real dynamic pages, no client/server boundary leaks), full `pnpm test` passes (170 files / 716 tests, zero regressions), every new component has a `renderToStaticMarkup` test. **Not done**: a live interactive browser walkthrough of `quickstart.md` — blocked by a concurrent session's `next dev` lock on this shared repo directory during implementation. Recommend running `quickstart.md` manually before considering this fully production-verified.

## Requirements

- [X] `prompts` (list, search/filter by project and ownership), `prompts/new`, `prompts/[name]` (detail: template/preview/applied-policies tabs, version history drawer, new-version drawer, sharing drawer), `projects` (list), `projects/[id]` (detail: members/prompts/repositories/teams tabs) — full page inventory confirmed against the actual mockup; see `specs/023-prompt-registry-views-ui/spec.md`'s Functional Requirements for the complete, itemized list
- [X] Sharing UI additionally supports granting a **project** direct access to a prompt (not just a user or team) — new scope beyond what `003-prompt-sharing.md` originally modeled (subscriber types were only `"user" | "team"`); confirmed with the user during `/speckit-specify` rather than assumed

## Acceptance Criteria

- [X] Every core workflow (browse/search/view a prompt, create/version a prompt, share a prompt, curate/organize a project) works end-to-end through this UI — see `specs/023-prompt-registry-views-ui/spec.md`'s Acceptance Scenarios for the itemized list; verified via automated tests, not yet via live manual browser walkthrough (see completion note above)
- [X] The page(s) visually match `SkillCanon Prompts.dc.html`, except where the spec's Assumptions explicitly note a deliberate deviation (Metrics tab dropped; only the mockup's "tabs" detail layout built, not its unreachable "split"/"form" alternates)

## Open Questions

- None currently — resolved during `/speckit-specify` (see `specs/023-prompt-registry-views-ui/spec.md`'s Assumptions).

## Dependencies

- `004-expansion-engine.md`
- `005-prompt-registry-tenant-isolation-tests.md`
- `backlog/004-app-shell-and-landing/EPIC.md`

## Technical Notes

Template/variable rendering (including any syntax highlighting) stays behind the sandboxed renderer per tenet S2 — this feature only touches presentation of the same rendered output, not how it's produced.

The mockup's Project Detail "Metrics" tab (usage/invocation analytics) was split out into `008-project-usage-metrics-dashboard.md` rather than built here — it depends on a per-invocation usage log this feature has no reason to introduce as a side effect. Do not re-add it to this feature's scope; extend `008` instead once its own dependencies (see that file) are ready.
