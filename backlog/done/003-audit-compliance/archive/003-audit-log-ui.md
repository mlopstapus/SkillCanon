---
epic: 003-audit-compliance
feature: 003-audit-log-ui
status: done
dependencies: ["002-audit-query-and-retention.md", "backlog/004-app-shell-and-landing/002-app-shell-and-navigation.md", "backlog/004-app-shell-and-landing/archive/001-design-tokens-and-theming.md"]
---

# Audit Log UI

The settings page where an org admin views (and, if entitled, exports) their audit trail — owned by this BC per `bcs/audit-compliance/OWNERSHIP.md` (`src/app/(app)/settings/audit-log`).

**Scope change (2026-07-23):** per an explicit decision to have the *real, visually-finished* audit trail in place, this feature builds directly from the imported Claude design mockup `SkillCanon Audit.dc.html` (claude.ai/design project `7babdbf3-c063-46b5-84df-ffa9f588d88a`) as the source of truth for layout, copy, and visual tokens — same as every other UI feature in this backlog now does.

**Sequencing update (2026-07-23):** `004-app-shell-and-landing` is being built *before* this feature rather than after it, so this feature no longer needs to build its own standalone shell or locally-scoped tokens (an earlier plan, superseded before any code was written — see that epic's own Notes). This feature now simply composes into the real shell and consumes the real shared tokens directly, like every downstream epic's UI feature does.

**Implementation source (2026-07-23):** this mockup is available through the `claude_design` MCP server (the same one used to import it) — pull the file's actual content (`DesignSync get_file`, project `7babdbf3-c063-46b5-84df-ffa9f588d88a`, path `SkillCanon Audit.dc.html`) rather than re-deriving the design from a screenshot or description. Treat that file as a literal blueprint, not just visual reference: its inline `<style>` block (CSS custom properties for the full color/font system), its exact markup structure (sidebar nav, filter bar, row grid, detail drawer), and its embedded `<script type="text/x-dc">` component logic (the `VERB`/`TRANSPORT`/`RES`/`ACTORS` maps, `deco()`/`diffOf()`/`renderVals()`) are the precise styling and behavior wanted — port them directly into the real Next.js/React/Tailwind implementation (translating the `.dc.html` component-preview format's state/props/`sc-if`/`sc-for` placeholders into real React state, conditionals, and `.map()`), then strip out whatever doesn't carry over (the `x-dc`/`data-dc-script` preview wrapper, `support.js`, the hardcoded mock `EVENTS` array once wired to real `list()` data). Don't restyle from scratch or approximate colors/spacing by eye — copy the actual token values and markup, then adapt.

**Completion note (2026-07-29, `020-audit-log-ui`):** built as speckit feature `specs/020-audit-log-ui/`, with two real, in-scope corrections discovered during `/speckit-clarify` and `/speckit-analyze` beyond a literal mockup port: (1) resource display names are resolved live per-row from each owning bounded context (no denormalized name exists on `AuditEvent`), with a raw-id fallback only for `project_member` (no id-based finder exists for that join-row type); (2) a Transport filter dropdown was added beyond the mockup's literal filter bar to satisfy this file's own filter requirements below; (3) the mockup's non-functional "Last 7 days" range label became a real presets+custom-range control; (4) the Actor filter lists every distinct actor in retained history (including departed members/revoked keys), not just current org members. A pre-existing but previously-unwired dependency on Billing & Entitlements (`resolveEntitlements`) was also connected for real retention-day resolution (`resolveAuditEntitlementsForOrg`), replacing a same-BC-only hardcoded stub. See `specs/020-audit-log-ui/` for the full spec/plan/research/data-model and `docs/context` for architecture notes.

## Requirements

- [X] `settings/audit-log` page: paginated, filterable (by free-text search, resource type, actor, transport, date range) view over `list()`, matching the mockup's filter bar (search input, Resource dropdown, Actor dropdown, date-range control, Clear-filters button that only appears when a filter is active)
- [X] Row list: time (absolute + relative), color-coded action badge (per the verb taxonomy added to `001-audit-event-schema-and-write-path.md`), resource name, actor (avatar-style initial + name + role/type subtext), transport/source badge (web/api/cli/system, colored per the mockup)
- [X] Detail drawer: clicking a row opens a right-side slide-in drawer showing the action/resource header, a 2x2 meta grid (Actor, Source+IP, Resource+id, Timestamp), a before/after change-diff view (red `−`/green `+` per changed key, "redacted secrets omitted" label), a no-diff state for auth events (login/logout) with explanatory copy, and the event's immutable id in its own footer row
- [X] Empty state: distinct copy for "no events at all" vs. "no events match these filters" (with a Clear-filters action in the latter case), per the mockup
- [X] Pagination footer showing the current range, total count, and the org's actual resolved retention window (see the correction in `002-audit-query-and-retention.md` — never hardcode "90 days (Free)"); a plan-tier *name* is deliberately not shown alongside it — no human-readable plan/tier name exists anywhere in this codebase yet to display honestly (see `specs/020-audit-log-ui/research.md`)
- [X] Export button, visible/enabled only when the org's entitlement allows it (disabled with an upgrade-prompt tooltip otherwise, once `009-billing-entitlements` exists — hidden entirely until then): implemented as `export-control.tsx`, currently always hidden since no export-specific entitlement key exists yet in `billing-entitlements`' `EntitlementSnapshot`
- [X] Admin-only access (matches current role-gating pattern for sensitive settings pages), via the real session-auth middleware built by `004-app-shell-and-landing/002-app-shell-and-navigation.md`
- [X] Composes into the real app shell from `004-app-shell-and-landing/002-app-shell-and-navigation.md` — a "Settings" nav section containing at least "API keys" and "Audit log", matching the mockup's structure
- [X] Uses the real shared tokens from `004-app-shell-and-landing/archive/001-design-tokens-and-theming.md` (dark theme, `--bg`/`--panel`/`--surface`/accent teal/etc., Bricolage Grotesque + Hanken Grotesk + Spline Sans Mono fonts, now live in `src/app/globals.css` + `src/shared/ui/`) — no locally-scoped/ad hoc styling

## Acceptance Criteria

- [X] Non-admin users cannot access the page (redirected or 403) — enforced via `canAccessAuditLog()` in `page.tsx`, unit-tested in `access.test.ts`
- [X] Filtering by search, resource type, actor, transport, and date range (alone and combined) returns correctly scoped results, and Clear filters resets all of them — verified via automated tests and live manual browser verification against real seeded data
- [X] Page renders correctly with zero events (empty state), with active filters that match nothing (the other empty state), and with a large event count (pagination works) — a real bug was caught via live manual testing where a zero-result filtered search incorrectly showed the "no events at all" copy instead of "no events match these filters" (the empty-state logic used the filtered total alone without checking whether any filter was actually active); fixed and covered by a regression test in `audit-log-view.test.tsx`
- [X] Opening a row's detail drawer shows the correct before/after diff for a mutation event, and the correct "no diff" copy for a login/logout event
- [X] Redacted fields (`password_hash`, `key_hash`, raw tokens) never render in the diff view, even though the mockup's own sample data includes a `key_hash` field — verified against `record()`'s real redaction behavior (a `[REDACTED]` placeholder is stored and rendered as-is; the raw value never reaches the database at all)
- [X] The page visually matches the `SkillCanon Audit.dc.html` mockup (colors, type, spacing, drawer behavior), with the documented Transport-filter and date-range exceptions noted above

## Open Questions

- None currently — the four scope questions this file originally implied (resource-name resolution, Transport filter, date-range interactivity, Actor filter scope) were resolved via `/speckit-clarify`; see `specs/020-audit-log-ui/spec.md`'s Clarifications section.

## Dependencies

- `002-audit-query-and-retention.md`
- `backlog/004-app-shell-and-landing/002-app-shell-and-navigation.md` (real shell + session-auth middleware this page composes into)
- `backlog/004-app-shell-and-landing/archive/001-design-tokens-and-theming.md` (real shared tokens this page uses)

## Technical Notes

This feature's scope was originally going to include pulling forward a temporary standalone shell and locally-scoped tokens, since `004-app-shell-and-landing` didn't exist yet at the time this file was first written. That epic is now being built first instead (see its own Notes), before any of that temporary version was ever implemented in code — so this feature depends on the real shell/tokens directly rather than building, then later reconciling, a throwaway copy.

The nav markup this page composes into (`004-app-shell-and-landing/002-app-shell-and-navigation.md`) was itself derived from this same `SkillCanon Audit.dc.html` mockup (plus `SkillCanon Governance.dc.html`), so this page's own left-nav requirements above should already match it exactly — flag any drift rather than silently diverging.

This is still a bigger lift than the file's original scope (a thin thing that could wait on a later epic) — that tradeoff was made explicitly to get the real, finished audit trail UI in place, and it went on to establish a standing pattern (every UI-bearing epic now builds its own real page directly, against its own mockup) rather than staying a one-off — see `backlog/003-audit-compliance/EPIC.md`'s Notes and `backlog/004-app-shell-and-landing/EPIC.md` for the resulting backlog restructuring.

**Post-implementation note (2026-07-29):** while completing this feature, `/speckit-analyze` discovered that `audit-compliance`'s own retention/export entitlement resolution had never actually been wired to the real `billing-entitlements` bounded context (which already existed and already listed "Audit & Compliance" as an intended consumer in its own `CONTRACT.md`) — it was calling a same-BC-only hardcoded stub instead. This was corrected as part of this feature (`resolveAuditEntitlementsForOrg`), since it directly affected this page's own retention-display and export-gating requirements above.
