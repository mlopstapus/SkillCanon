---
epic: 005-governance
feature: 005-governance-views-ui
status: open
dependencies: ["003-hierarchical-resolution-engine.md", "004-governance-tenant-isolation-tests.md", "backlog/004-app-shell-and-landing/002-app-shell-and-navigation.md"]
---

# Governance Views UI

The real, finished policies/objectives UI — owned by this BC per `bcs/governance/OWNERSHIP.md` (`src/app/(app)/teams/*/policies`, `/objectives`) — built directly against the real `SkillCanon Governance.dc.html` mockup (claude.ai/design project `7babdbf3-c063-46b5-84df-ffa9f588d88a`, via the `claude_design` MCP server), mirroring `003-audit-compliance/003-audit-log-ui.md`'s pattern: schema/query gaps found while reading the mockup were fed back into this epic's other features first (see the notes added to `001-policy-model-and-crud.md` and `003-hierarchical-resolution-engine.md`), and this feature builds the page for real, composed into the shared shell from `004-app-shell-and-landing/002-app-shell-and-navigation.md` rather than a placeholder.

**Blocking note (2026-08-05):** confirmed via audit that no policy/objective UI exists anywhere in the app yet (only the legacy Python frontend had one) — this item is directly blocking `backlog/008-distribution/003-web-ui-shell-and-core-pages.md` and `backlog/010-ui-polish-and-accessibility/001-cross-page-polish-and-accessibility.md`, both of which need a working "create a policy" flow for their own required smoke tests. Worth prioritizing above other still-open items in this epic given that downstream blast radius.

## Requirements

- [ ] Scope tree sidebar: filterable team/user hierarchy, each node showing a local policy+objective count badge — requires a per-node aggregate count query (see the new requirement added to `003-hierarchical-resolution-engine.md`)
- [ ] Main panel: Policies/Objectives tabs, each split into an "Inherited" group (from ancestor scopes, immutable, read-only) and a "Local" group (editable at the selected scope), matching the mockup's two-group visual split
- [ ] "New policy"/"New objective" drawer: name, enforcement-type selector, priority, content — enforcement-type selector must offer all four real values (`prepend`/`append`/`inject`/`validate`), not just the three the mockup's drawer shows (see Open Questions)
- [ ] "View as {{ user }}" control: lets an admin preview effective policies/objectives as a specific user — this is a UI affordance over the existing `resolveEffectivePolicies(orgId, userId, projectId?)`/`resolveEffectiveObjectives(...)` contract (already accepts `userId`), not a new backend capability
- [ ] Empty states for "no local policies/objectives at this scope" per the mockup

## Acceptance Criteria

- [ ] Selecting a different scope-tree node updates the Inherited/Local split correctly for that node
- [ ] Creating a policy with the `validate` enforcement type works end-to-end (schema, resolution, and this UI all agree on the same four-value enum)
- [ ] Per-node counts match the actual number of local policies+objectives at that node
- [ ] The page visually matches `SkillCanon Governance.dc.html`

## Open Questions

- **Mockup gap**: the "New policy" drawer only offers `prepend`/`append`/`inject` as enforcement types, omitting `validate` (a real fourth value in `001-policy-model-and-crud.md`'s schema). Confirm whether `validate` needs its own UI treatment (it may not map to "before/after/into template" the same way) before implementing.
- **Mockup gap**: the scope tree only navigates team/user hierarchy — it has no project node or project-scoped view at all, even though policies/objectives can attach to a `project_id` instead of a `team_id` (`001-policy-model-and-crud.md`'s "exactly one of team/project" invariant). Confirm whether project-scoped policy/objective management is meant to live here (missing from this mockup) or on a project detail page owned by `006-prompt-registry` instead.
- **Mockup ambiguity**: the mockup computes a merged, priority-sorted `previewPolicies`/`previewObjectives` list (inherited + local combined, sorted by priority) but never actually renders it anywhere in the visible markup — only the separate Inherited/Local groups are shown. Confirm whether the real UI needs a "final effective/merged order" view (matching `resolveAllPolicies`'s actual merge+tiebreak semantics) in addition to, or instead of, the two-group split.

## Dependencies

- `003-hierarchical-resolution-engine.md`
- `004-governance-tenant-isolation-tests.md`
- `backlog/004-app-shell-and-landing/002-app-shell-and-navigation.md`

## Technical Notes

Pull the mockup's actual file content via `DesignSync get_file` (project `7babdbf3-c063-46b5-84df-ffa9f588d88a`, path `SkillCanon Governance.dc.html`) and port its CSS custom properties, markup, and `Component` class logic (`NODES`/`POL`/`OBJ`/`decoP`/`decoO`/`inhP`/`inhO`) directly, per the same porting approach established in `003-audit-compliance/003-audit-log-ui.md`.
