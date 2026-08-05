---
epic: 004-app-shell-and-landing
feature: 004-dashboard-overview-content
status: open
dependencies: ["archive/002-app-shell-and-navigation.md"]
---

# Dashboard ("Overview") Content

Discovered 2026-08-05 while continuing `010-ui-polish-and-accessibility/001-cross-page-polish-and-accessibility.md`'s cross-page audit: `/dashboard` — the left nav's "Overview" link, the first thing an admin sees after registering or logging in — has never had real content built. `src/app/(app)/dashboard/page.tsx` is a static eyebrow + `<h1>Overview</h1>`, nothing else; it has been this way since `archive/002-app-shell-and-navigation.md` built the `/dashboard` "composition point" (its own words) without a page composed into it. No BC has ever claimed ownership: unlike `/prompts` (prompt-registry), `/teams`+`/teams/[teamId]/policies` (identity-access + governance), and `/metrics` (distribution), no epic's backlog has a "dashboard" or "overview" feature anywhere.

This is real missing content, not a polish/accessibility/empty-state issue — `010-ui-polish-and-accessibility/001`'s own scope (documented in its Technical Notes) is a consistency/accessibility pass across pages that already exist, not building new page content. Tracked here instead, in the epic that already owns the `/dashboard` composition point.

No design mockup depicts real dashboard content — the two source mockups this app was built against (`SkillCanon Governance.dc.html`, `SkillCanon Prompts.dc.html`) both link to `/dashboard` from their nav but neither renders it. Don't invent a dashboard layout from scratch without one; either source a mockup first, or treat this as a genuinely new design decision requiring the same rigor as any other page (confirm with a stakeholder what an "Overview" page should actually show before building it).

## Requirements

- [ ] Decide what the dashboard actually shows — candidates, given what other pages already expose: a cross-BC summary (e.g. recent prompt activity, governance policy/objective counts, team member count, last-30-days usage total) pulling from each owning BC's already-exported read functions, not new BC capability
- [ ] Build the page against a real design (mockup or explicit design decision), composed into the existing shell exactly like every other page
- [ ] Apply this repo's established empty/loading/error state conventions (`AppState` from `@/shared/ui`, per `docs/context/design-system.md` §7) from the start, not retrofitted later

## Acceptance Criteria

- [ ] `/dashboard` shows real, useful content for a freshly-registered org (not just a title) and for an org with existing data
- [ ] Content sources are real BC-exported reads, no fabricated/placeholder data
- [ ] Empty/loading states follow the shared `AppState` pattern

## Open Questions

- Which BC(s) should the page's data-fetching code actually live in — a new thin composition-only page (like `010-ui-polish-and-accessibility`'s no-new-BC-logic convention for pure verification features) calling into several existing BCs' exported reads, most likely, but confirm no BC wants to claim "workspace summary" as its own owned concern first.

## Dependencies

- `backlog/004-app-shell-and-landing/archive/002-app-shell-and-navigation.md` (the composition point this fills)

## Technical Notes

Filed instead of silently building placeholder content while doing `010-ui-polish-and-accessibility/001`'s audit — per this repo's established convention, a real content gap found during an unrelated pass gets its own backlog item in the epic that actually owns it, not folded into the pass that found it.
