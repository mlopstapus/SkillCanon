# Feature Specification: Audit Query & Retention

**Feature Branch**: `015-audit-query-retention`

**Created**: 2026-07-25

**Status**: Draft

**Input**: User description: "Audit Query & Retention: implement list() and export() per bcs/audit-compliance/CONTRACT.md, gated by the caller's entitlement-resolved retention window, plus the scheduled pruning job that enforces retention" (source: `backlog/003-audit-compliance/002-audit-query-and-retention.md`)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Search and filter the organization's audit trail (Priority: P1)

An org admin investigating a security question or compliance request narrows the organization's audit history down to the specific events they care about — by free-text search, resource type, actor, transport, or a date range, alone or combined — and sees only their own organization's activity.

**Why this priority**: This is the entire reason the audit log exists as a usable tool rather than an inert table — without a working, filterable query, nobody can actually answer "who did what, when." It is the direct dependency the audit log UI (`003-audit-log-ui`) is built against.

**Independent Test**: Seed an organization with a variety of audit events (different actions, resource types, actors, transports, timestamps) plus at least one event belonging to a different organization. Confirm each filter dimension, alone and in combination, narrows results to exactly the matching events, and that the other organization's event never appears regardless of filters used.

**Acceptance Scenarios**:

1. **Given** an organization with a mix of audit events, **When** an admin queries with no filters, **Then** they see a paginated, reverse-chronological list of that organization's events only, with no events from any other organization.
2. **Given** an organization's audit events, **When** an admin filters by free-text search, resource type, actor, transport, or a created-at date range — individually or combined — **Then** only events matching every applied filter are returned.
3. **Given** a filter combination that matches nothing, **When** the query runs, **Then** an empty result set is returned, not an error.
4. **Given** two organizations each with their own audit events, **When** either organization's admin queries their own events, **Then** the other organization's events never appear in the result, under any filter combination.

---

### User Story 2 - Audit history is automatically retained only within the entitled window (Priority: P1)

Without anyone taking manual action, an organization's audit history older than its entitled retention period is permanently removed on a regular schedule, and each cleanup run itself leaves a visible record in the trail — so the audit log neither grows unbounded nor silently loses data outside of the documented policy.

**Why this priority**: This is the "Retention" half of this feature's own name and a direct compliance requirement — audit data has to actually expire on schedule, not just theoretically, and the epic's stated purpose (SOC2/NIST alignment) depends on this being verifiably enforced rather than assumed.

**Independent Test**: Seed an organization with events straddling both sides of its retention window, run the pruning job, and confirm events older than the window are gone, events inside it remain untouched, and exactly one new event now exists recording that the run happened and how many rows it removed.

**Acceptance Scenarios**:

1. **Given** an organization with audit events both inside and outside its retention window, **When** the scheduled pruning job runs, **Then** every event older than the window is permanently removed and every event inside the window is left untouched.
2. **Given** a completed pruning run, **When** the audit trail is queried afterward, **Then** exactly one new event exists recording that the pruning job ran and how many events it deleted, attributed to no human or API-key actor.
3. **Given** an organization with nothing eligible for deletion, **When** the pruning job runs, **Then** it still records a run with a deleted count of zero, rather than staying silent.
4. **Given** a query for an organization's audit trail, **When** filters would otherwise include events older than that organization's current retention window, **Then** those events never appear, whether or not the pruning job has physically deleted them yet.

---

### User Story 3 - Export the audit trail for compliance reporting (Priority: P2)

An org admin whose organization holds the export entitlement downloads their complete, currently-retained audit history as a file suitable for a compliance review or an external auditor, while an organization without that entitlement is cleanly blocked from doing so.

**Why this priority**: Valuable for the compliance/reporting workflows this epic exists to serve, but the system already delivers its core value (Stories 1 and 2) without it — export is an additional, entitlement-gated convenience on top of a working, correctly-retained audit trail.

**Independent Test**: For an organization holding the export entitlement, request an export and confirm it produces the organization's complete currently-retained history in a usable file. For an organization without the entitlement, confirm the request is rejected rather than silently producing a partial or empty file.

**Acceptance Scenarios**:

1. **Given** an organization that holds the export entitlement, **When** an admin requests an export, **Then** a file containing that organization's complete currently-retained audit history is produced.
2. **Given** an organization that does not hold the export entitlement, **When** an admin requests an export, **Then** the request is rejected and no file is produced.
3. **Given** an organization with zero currently-retained events, **When** an admin with the export entitlement requests an export, **Then** a valid, empty export file is produced rather than an error.

---

### Edge Cases

- What happens when a page beyond the last available page is requested? An empty page is returned, not an error.
- What happens when the pruning job runs for an organization with nothing older than its window? It still records exactly one run with a deleted count of zero (see Story 2, Scenario 3).
- What happens once a pruning job's own recorded run itself ages past the retention window? It is pruned by a later run like any other event — it is not permanently exempt.
- What happens when an organization's entitled retention window changes (e.g., a tier change) between pruning runs? The next scheduled run enforces whatever window currently applies, pruning anything now outside it; there is no retroactive grandfathering of previously-retained events.
- What happens when free-text search is combined with other filters that individually would match different sets of events? Only events satisfying every applied filter simultaneously are returned.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a paginated query over an organization's audit events, returning only that organization's own events — under no filter combination may another organization's events appear.
- **FR-002**: System MUST support filtering query results by free-text search (matching partial, case-insensitive text across the event's action, resource type, resource id, or actor's display name), resource type (exact match), actor (exact match on a specific human or API-key actor), transport (exact match on web/api/cli/system), and a created-at date range — usable individually or in any combination.
- **FR-003**: When queried with no filters, System MUST still return only events within the organization's current retention window, most recent first, in bounded pages.
- **FR-004**: System MUST exclude from query results any event older than the organization's currently entitled retention window, regardless of whether the pruning job has physically removed it yet.
- **FR-005**: System MUST run a scheduled job that permanently deletes every audit event older than its organization's currently entitled retention window, leaving events inside the window untouched.
- **FR-006**: System MUST record each pruning run as its own new audit event — attributed to no human or API-key actor, tagged as system-originated, and carrying the count of events that run deleted (including zero) — so the pruning job's activity is itself visible in the trail rather than a silent background operation.
- **FR-007**: System MUST support bulk export of an organization's complete, currently-retained audit history as a downloadable file, in at least CSV format.
- **FR-008**: System MUST reject an export request for any organization that does not currently hold the export entitlement, producing no file.
- **FR-009**: Until a live, real entitlement-resolution capability exists, System MUST apply a hardcoded default to every organization: a 7-day retention window and no export entitlement — never granting a longer window or export access by default in the absence of a real entitlement source.
- **FR-010**: System MUST NOT expose any redacted/secret field (as already stripped by the write path) through query or export results — this feature only reads what was already written; it introduces no new exposure path for secret material.

### Key Entities

- **Audit Event** *(existing entity, defined by the audit event schema/write path feature this one depends on)*: An immutable record of one mutation or system action — this feature only reads and (via pruning) deletes rows of this existing entity; it defines no new fields on it.
- **Retention Window**: The number of days of audit history an organization is entitled to keep, currently a hardcoded 7-day default for every organization pending real entitlement resolution. Not a stored/manageable entity in its own right yet — a value resolved per query and per pruning run.
- **Pruning Run**: Not a separate stored entity — represented entirely as one Audit Event per completed run (the system-originated record described in FR-006), so its own history lives in the same trail it maintains.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An org admin can go from "I need to find a specific event" to a narrowed, correct result set using any single filter or any combination of filters, with zero events from another organization ever appearing.
- **SC-002**: At any point in time, 100% of an organization's queryable audit history falls within its currently entitled retention window — zero events older than that window remain visible or exportable.
- **SC-003**: Every scheduled pruning run leaves exactly one verifiable, queryable record of its own execution (including runs that delete nothing), so an admin reviewing the trail can always confirm the job ran on schedule.
- **SC-004**: Export requests succeed only for organizations holding the export entitlement and are rejected 100% of the time otherwise, with no partial or silent success in either direction.
- **SC-005**: Cross-organization data leakage in query or export results is zero, across every filter combination, verified by dedicated tenant-isolation testing.

## Assumptions

- This feature builds only the domain/application/infrastructure layer (`list()`, `export()`, the pruning job) — consistent with this repo's established pattern for bounded-context features — and ships no REST route or UI page itself; that is owned by the dependent `003-audit-log-ui` feature.
- `list()`'s `requestingUserId` parameter is accepted for attribution/future use; this feature does not itself enforce admin-only access. Role-based access gating (who is allowed to query/export at all) is owned by the consuming UI/route layer, matching this repo's existing precedent of route-layer-owned authorization.
- No dedicated "export" entitlement key exists yet in the entitlement catalog (`docs/context/entitlements.md` lists no such key). Until epic 009 (Billing & Entitlements) defines one, this feature treats every organization as not holding it — failing closed — consistent with this epic's hardcoded-Free-tier-default approach to the retention window.
- The pruning job's own recorded event uses a resource type representing the audit log itself as the thing acted on (the source backlog item left this detail open, noting only "`resourceType: 'user'` or similar"), and a null resource id, since a bulk deletion has no single entity to reference.
- Free-text search performs a case-insensitive partial match, matching standard single-search-box UX and the source design mockup referenced by `003-audit-log-ui`.
- `export()` always covers an organization's complete currently-retained history with no filter parameters, matching the `export(orgId, format)` signature already defined in `bcs/audit-compliance/CONTRACT.md`.
- Export format support starts with CSV only for launch; broader format support (e.g., JSON/SIEM-friendly) remains an explicitly deferred, non-blocking decision per the source backlog item's own Open Questions section.
- Pagination uses a standard bounded page size; the exact default and maximum values are an implementation detail for planning, not a business requirement.
- This feature depends on the audit event schema and `record()` write path (`001-audit-event-schema-and-write-path`) already existing to write to and read from — it introduces no changes to that schema beyond what pruning needs (delete access).
