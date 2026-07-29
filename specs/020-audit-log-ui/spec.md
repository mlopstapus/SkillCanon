# Feature Specification: Audit Log UI

**Feature Branch**: `020-audit-log-ui`

**Created**: 2026-07-28

**Status**: Draft

**Input**: User description: "backlog/003-audit-compliance/003-audit-log-ui.md — pull the design directly from the `claude_design` MCP server (SkillCanon Audit.dc.html, project 7babdbf3-c063-46b5-84df-ffa9f588d88a) and implement it: the settings page where an org admin views (and, if entitled, exports) their audit trail."

## Clarifications

### Session 2026-07-28

- Q: The stored `AuditEvent` only has `resourceType` + a `resourceId` UUID (no denormalized human-readable name column), but the mockup's row list and detail drawer both show named resources (e.g. "pin-model-version," "staging-ci"). How should the real page get that display name? → A: Best-effort resolve the name live, per row, via the owning bounded context's public API at read time; fall back to displaying the raw resource id whenever resolution fails or the resource no longer exists.
- Q: The pulled mockup's filter bar only renders Search, Resource, and Actor dropdowns plus a date-range button — no distinct "Transport" dropdown — even though the backlog text and this spec both list transport as a filter dimension, and the underlying query layer already accepts a `transport` filter. What should this feature do? → A: Add a "Transport" filter dropdown, matching the Resource/Actor dropdown pattern, even though it's absent from the literal mockup markup.
- Q: The mockup's date-range control is a static "Last 7 days" label whose click handler is a literal no-op in the source, but the underlying query already accepts an arbitrary `createdAtFrom`/`createdAtTo` range. What date-range interaction should this feature build? → A: A small set of relative presets (Last 24h / 7d / 30d / All within retention) plus an explicit custom start+end date picker.
- Q: Should the Actor filter dropdown list only currently-active org members/API keys, or every distinct actor who actually appears in the org's retained audit history (including departed members and revoked keys)? → A: Every distinct actor that actually appears in the org's currently-retained audit events, including departed members, revoked keys, and system.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse and filter the organization's audit trail (Priority: P1)

An organization admin opens the Audit Log settings page and sees every recorded mutation across the workspace in reverse-chronological order — who did what, to what, and how (web, API, CLI, or system). They narrow the list by free-text search, resource type, actor, transport, and date range, in any combination, and clear all active filters in one action.

**Why this priority**: This is the entire reason the page exists — without a legible, filterable trail, nothing else in this feature (inspecting an event, exporting it) has anything to act on. It is the foundation every other story depends on.

**Independent Test**: Can be fully tested by opening the Audit Log page as an admin, confirming the full org trail renders paginated and reverse-chronological, applying each filter type alone and in combination and confirming the result set narrows correctly, then clearing filters and confirming the full list returns.

**Acceptance Scenarios**:

1. **Given** an organization with recorded audit events, **When** an admin opens the Audit Log page, **Then** events render newest-first, each showing its time (absolute and relative), a color-coded action badge, the affected resource, the actor, and the transport/source.
2. **Given** the Audit Log page, **When** an admin enters free-text in the search field, **Then** the list narrows to events whose action, resource, or actor match the query.
3. **Given** the Audit Log page, **When** an admin selects a resource type, an actor, a transport, and a date range together, **Then** the list narrows to events matching all four simultaneously, not just the most recent one applied.
4. **Given** one or more active filters, **When** an admin selects "Clear filters," **Then** every filter resets and the full trail (within the current retention window) reappears.
5. **Given** an organization with more events than fit on one page, **When** an admin pages through the trail, **Then** each page loads correctly-scoped results and the footer accurately reflects the shown range and total count.
6. **Given** a signed-in user who is not an organization admin, **When** they attempt to reach the Audit Log page, **Then** they are denied access rather than shown any portion of the trail.
7. **Given** an actor (user or API key) who no longer exists in the organization but has past recorded events, **When** an admin opens the Actor filter, **Then** that actor still appears as a selectable option and filtering by them returns their historical events correctly.

---

### User Story 2 - Inspect the full detail of a single audit event (Priority: P1)

An admin clicks any event row and a detail view opens showing exactly what changed: the actor, source (transport + IP), resource, and timestamp, plus a field-by-field before/after diff for mutations — or a clear "nothing to diff" explanation for authentication events like login/logout. The event's own immutable identifier is always visible.

**Why this priority**: The row list alone tells an admin *that* something happened; this is what lets them actually understand and act on *what* happened, which is the compliance-driving purpose of the whole feature.

**Independent Test**: Can be fully tested by opening a mutation event's detail view and confirming the before/after diff matches the underlying change, then opening a login/logout event and confirming the no-diff explanation appears instead of an empty or broken diff view.

**Acceptance Scenarios**:

1. **Given** a mutation event (e.g. a policy or API key change), **When** an admin opens its detail view, **Then** a field-by-field diff shows removed values and added values distinctly for every field that changed.
2. **Given** an authentication event (login, logout, or a failed login), **When** an admin opens its detail view, **Then** the view shows explanatory copy that no resource state change was recorded, instead of an empty diff.
3. **Given** any event's detail view, **When** an admin views it, **Then** the actor, source (transport and IP), resource (type and id), timestamp, and the event's own immutable id are all visible.
4. **Given** an event whose recorded `before`/`after` values include a redacted field (e.g. a key hash), **When** an admin opens its detail view, **Then** that field never renders its real value in the diff, even though the underlying data included it.
5. **Given** the detail view is open, **When** an admin dismisses it, **Then** it closes without altering the underlying filtered list or page position.

---

### User Story 3 - Understand empty and no-match states (Priority: P2)

An admin opens the Audit Log page for an organization with no recorded events yet, or applies filters that match nothing, and sees a state that clearly explains which situation they're in and, when filters are the cause, an obvious way to clear them.

**Why this priority**: Distinguishing "nothing has ever happened here" from "your filters are too narrow" prevents an admin from wrongly concluding the audit system itself isn't working — a real trust concern for a compliance-facing feature — but it only matters once Story 1's filtering exists to produce the second case.

**Independent Test**: Can be fully tested by viewing the page for an org with zero events and confirming the "no events at all" message appears with no clear-filters action, then applying a filter combination that matches nothing and confirming the distinct "no matches" message and clear-filters action appear instead.

**Acceptance Scenarios**:

1. **Given** an organization with no audit events recorded, **When** an admin opens the page with no filters applied, **Then** a message explains no events exist yet, with no "clear filters" action shown.
2. **Given** an organization with existing audit events, **When** an admin applies filters that match none of them, **Then** a distinct message explains no events match the current filters, alongside a "clear filters" action that restores the full list.

---

### User Story 4 - Export the audit trail when entitled (Priority: P3)

An admin on a plan entitled to audit export downloads the organization's currently-retained trail. An admin on a plan not yet entitled sees why exporting isn't available to them.

**Why this priority**: Export is explicitly gated on an entitlement system (Billing & Entitlements) that does not exist yet in this codebase — this story only becomes actionable once that dependency ships, so it is the lowest priority and, until then, the export control stays hidden entirely rather than shown-and-disabled.

**Independent Test**: Cannot be independently tested end-to-end today, since no organization can yet be entitled to export (the entitlement system this depends on doesn't exist). Once it does, this is testable by confirming an entitled org's export button downloads the full currently-retained trail, and a non-entitled org either sees no export control or a disabled one with an explanation.

**Acceptance Scenarios**:

1. **Given** the entitlement system does not yet exist, **When** any admin views the Audit Log page today, **Then** no export control is shown at all.
2. **Given** the entitlement system exists in the future and an org is not entitled to export, **When** its admin views the page, **Then** an export control is visible but disabled, with an explanation of what plan tier is required.
3. **Given** the entitlement system exists in the future and an org is entitled to export, **When** its admin selects Export, **Then** the organization's currently-retained audit trail downloads.

---

### Edge Cases

- What happens when a non-admin attempts to load the audit log data directly (bypassing the UI, e.g. by resubmitting a request)? The system rejects it server-side with a clear denial, regardless of what the UI would have shown.
- What happens when the organization's retention window has changed (e.g. via a future plan change) since the last time the page was viewed? The pagination footer always reflects the organization's currently-resolved retention window/tier label at request time, never a value cached from an earlier view or a hardcoded default.
- What happens when an event has no resource ("system" actor, e.g. a scheduled retention prune)? The row and detail view still render coherently, using placeholder/system-appropriate labels rather than blank or broken fields.
- What happens when a filtered search matches an actor's display name but that actor no longer exists in the organization (e.g. a removed user)? The event still renders using whatever actor identity was recorded at write time, since the audit trail is immutable and must not silently lose historical actor context.
- What happens when a redacted field is the *only* thing that changed on a mutation? The diff view shows that the field changed without exposing its value, rather than showing an empty diff that implies nothing changed.
- What happens when an event's referenced resource has since been deleted, or its owning bounded context can't be reached to resolve a display name? The row and detail view fall back to the resource's raw id rather than showing a blank, broken, or incorrectly-stale name.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Only organization admins MUST be able to access the Audit Log page; all other users MUST be denied, both in the UI and server-side.
- **FR-002**: The system MUST display the organization's audit events in reverse-chronological (newest-first) order, paginated.
- **FR-003**: Each event row MUST show its time (absolute and relative), a color-coded action badge reflecting its verb, the affected resource's type and a resolved display name, the actor (with a role/type indicator), and the transport/source (web, API, CLI, or system), each visually distinguished.
- **FR-003a**: The system MUST resolve a resource's display name live, at read time, from the bounded context that owns that resource type; when resolution fails (the resource has since been deleted, or its owning context cannot be reached), the system MUST fall back to showing the resource's raw id rather than a blank, broken, or stale name.
- **FR-004**: Users MUST be able to filter events by free-text search across action, resource, and actor.
- **FR-005**: Users MUST be able to filter events by resource type, by actor, by transport (web, API, CLI, system), and by date range, independently and in any combination with each other and with free-text search — including a dedicated Transport filter control, added beyond the pulled mockup's literal filter bar to match the backlog's explicit filter requirements.
- **FR-005a**: The date-range filter MUST offer a small set of relative presets (e.g. Last 24 hours, Last 7 days, Last 30 days, All within retention) and MUST also let a user pick an explicit custom start and end date, rather than exposing only a static, non-interactive range label as the pulled mockup's own markup does.
- **FR-005b**: The Actor filter's available options MUST be derived from every distinct actor that actually appears in the organization's currently-retained audit events — including users who have since left the organization and API keys that have since been revoked — not just currently-active members and keys.
- **FR-006**: The system MUST show a "Clear filters" action whenever at least one filter is active, and MUST NOT show it when no filters are active; selecting it MUST reset every active filter at once.
- **FR-007**: Selecting an event row MUST open a detail view showing: the resolved resource display name (or its raw-id fallback) as the header title, the actor, the source (transport and IP address), the resource (type and id), the timestamp, and the event's own immutable id.
- **FR-008**: The detail view MUST show a field-by-field before/after diff for events with a recorded state change, distinguishing removed and added values per field.
- **FR-009**: The detail view MUST show explanatory "no state change recorded" copy, instead of an empty or broken diff, for events with no recorded state change (e.g. login, logout).
- **FR-010**: The system MUST NOT render the real value of any redacted field (e.g. password hash, API key hash, raw tokens) in any diff view, even when the underlying event data contains it.
- **FR-011**: The system MUST show a distinct empty state, with no "clear filters" action, when the organization has zero recorded audit events.
- **FR-012**: The system MUST show a distinct empty state, with a "clear filters" action, when active filters match zero events.
- **FR-013**: The pagination footer MUST show the currently-shown range, the total matching count, and the organization's actual currently-resolved retention window in days — sourced from the real entitlement resolver (Billing & Entitlements), never a hardcoded value or a fabricated plan-tier name (no human-readable plan/tier name exists anywhere in the codebase yet to display honestly).
- **FR-014**: The system MUST hide the export control entirely until an audit-export entitlement exists to evaluate; once one exists, the control MUST be visible-but-disabled with an upgrade explanation for non-entitled organizations, and enabled for entitled ones.
- **FR-015**: The Audit Log page MUST be reachable from the shared application "Settings" navigation section, alongside "API keys," consistent with the rest of the authenticated product.
- **FR-016**: The system MUST reject any unauthorized attempt to read audit event data server-side, regardless of what the requesting UI displays.

### Key Entities

- **Audit Event**: An immutable record of one mutation (or authentication attempt) — timestamp, actor, action verb, affected resource (type + id only; no stored display name), transport/source, before/after state (redacted of secrets), and its own permanent id. Never updated after creation; only removed by retention pruning. A resource's human-readable display name is not part of this record — it is resolved live at read time from the owning bounded context, with the raw id as a fallback.
- **Filter Set**: The admin's currently-applied combination of free-text search, resource type, actor, transport, and date range, used to narrow the displayed trail without altering the underlying data.
- **Retention Window**: The organization's currently-resolved number of days of audit history it is entitled to see and export, driven by its plan tier.
- **Export Entitlement**: A future plan-tier-driven permission determining whether an organization's admins may export its audit trail; not yet resolvable in this codebase.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An admin can locate a specific past event (by narrowing with search, resource, actor, and/or date filters) in under 30 seconds on an organization with over 1,000 recorded events.
- **SC-002**: 100% of redacted fields never appear with their real value anywhere in the detail view, across every event type in the underlying data.
- **SC-003**: An admin can distinguish "no events at all" from "no events match my filters" without needing to inspect the applied filters themselves — the page's own copy makes the distinction unambiguous.
- **SC-004**: 100% of non-admin access attempts to the page or its underlying data are blocked, whether attempted through the UI or directly against the underlying request.
- **SC-005**: The retention window (in days) shown in the pagination footer always matches the organization's actual currently-resolved entitlement from Billing & Entitlements, with zero instances of a hardcoded, stale, or fabricated value.

## Assumptions

- The pulled design ("SkillCanon Audit.dc.html", claude.ai/design project `7babdbf3-c063-46b5-84df-ffa9f588d88a`) is the authoritative visual and interaction reference for this feature, per the originating backlog item's acceptance criteria that the shipped page visually match the mockup (colors, type, spacing, drawer behavior) — with two documented exceptions (see Clarifications): a Transport filter dropdown is added beyond the mockup's literal filter bar, matching the same visual pattern as the mockup's own Resource and Actor dropdowns; and the mockup's static, non-interactive "Last 7 days" range label is replaced with a real preset+custom date-range control, since the underlying query already supports an arbitrary range and the mockup's own click handler for it is a literal no-op.
- Resource display names are not stored on the audit event itself; this feature resolves them live at read time from each resource type's owning bounded context (via its public API/barrel, per this repo's module-boundary rules), falling back to the raw resource id when a resource has been deleted or its owning context can't resolve it (see Clarifications).
- The underlying query, redaction, and retention behavior (`listAuditEvents`, `record()`'s redaction, retention-window resolution) already exist in the Audit & Compliance bounded context and are being composed into, not built by, this feature.
- The real application shell, session-auth middleware, and shared design tokens this page composes into already exist (app shell/navigation and design tokens/theming), including an existing "Settings → Audit log" navigation entry already wired to this page's route; this feature only needs to build the page itself.
- Audit export depends on a dedicated export-entitlement key that does not exist yet in the Billing & Entitlements bounded context's `EntitlementSnapshot` (that BC itself already exists and is already wired for consumption elsewhere — e.g. the app shell's `coreFeaturesEnabled` gate — it simply has no audit-export-specific key yet); until one is added, the export control is hidden entirely rather than shown in a disabled state, matching the current hard-fail behavior of the underlying export function.
- "Organization admin" is the only role permitted to view this page, matching the existing two-role (admin/member) model; no finer-grained per-resource permission is introduced by this feature.
- The mockup's illustrative sample data (hardcoded events, a "90 days (Free)" retention label) is a visual placeholder only; this feature always wires the page to real, live query results and the organization's actual resolved retention window, never the mockup's literal sample values.
- Mobile/responsive layout follows the same collapsing behavior already established elsewhere in the authenticated app shell; no separate mobile-specific design was provided for this page.
