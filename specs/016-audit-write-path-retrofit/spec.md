# Feature Specification: Audit Write Path Retrofit, Transport/Source Tracking & Action Vocabulary

**Feature Branch**: `016-audit-write-path-retrofit`

**Created**: 2026-07-25

**Status**: Clarified

**Input**: User description: "Audit Event Schema & Write Path — remaining scope (backlog/003-audit-compliance/001-audit-event-schema-and-write-path.md, issue SKI-27)"

## Clarifications

### Session 2026-07-26

- Q: Should this feature's retrofit scope also cover the two existing user-update mutations (`update-user`, `deactivate-user`), or is user-update coverage intentionally deferred to a later item? → A: Yes — include `update-user` and `deactivate-user` in this feature's retrofit scope alongside user creation.
- Q: Should the documented action-verb vocabulary be corrected to match what's actually shipped (drop `invited`, add `accepted`), or should shipped call sites be renamed to match the originally proposed list? → A: Yes — correct the documented vocabulary to match shipped code (drop `invited`, add `accepted`); no shipped call sites are renamed.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Every identity mutation appears in the audit trail (Priority: P1)

A compliance officer or org admin reviewing the audit log expects that any change to an organization, team, or user in their org — not just logins/logouts — shows up as an event, with no gaps.

**Why this priority**: This is the core, tenet-C1-mandated guarantee ("every mutation captured, on every transport"). Today, organization creation, team creation/update/reparenting/insert-between, and user creation/update/deactivation mutate real rows with no corresponding audit row at all — the single biggest hole in the audit trail as it exists right now.

**Independent Test**: Perform each of these mutations against a real database and confirm exactly one `audit_events` row is written in the same transaction; force each mutation to fail partway through and confirm no audit row is written either.

**Acceptance Scenarios**:

1. **Given** an admin creates a new organization, **When** the creation succeeds, **Then** exactly one audit event is recorded describing that creation, in the same transaction as the row insert.
2. **Given** an admin creates, updates, reparents, or inserts a team between two existing teams, **When** each of those operations succeeds, **Then** exactly one corresponding audit event is recorded for that operation, in the same transaction.
3. **Given** a new user is created (self-registration, invitation acceptance, or first-run admin bootstrap) or an existing user is updated or deactivated, **When** that operation succeeds, **Then** exactly one corresponding audit event is recorded, in the same transaction.
4. **Given** any of the mutations above, **When** the mutation is forced to fail (e.g. a constraint violation or a thrown error mid-transaction), **Then** no audit event is written for that attempt — the mutation and its audit record roll back together.
5. **Given** an admin invites a user, accepts an invitation, revokes an invitation, creates an API key, or revokes an API key, **When** each of those already-shipped operations is exercised, **Then** it continues to write exactly one corresponding audit event as it does today — this spec does not change their behavior (see Assumptions).

---

### User Story 2 - Knowing which surface a change came from (Priority: P2)

A compliance officer investigating an audit event wants to know whether it originated from the web app, a REST API call, the CLI, or an automated system process (e.g. a scheduled job), and, where relevant, from what IP address — matching the "Source" column the audit log UI is designed to show.

**Why this priority**: Without this, the audit trail cannot answer "which surface did this mutation come from," a capability tenet C1 and the audit-compliance contract's own UI description both assume exists. It's ranked below User Story 1 because it enriches every event rather than closing a total gap in coverage.

**Independent Test**: Record an audit event through each entry point (web session request, API-key-authenticated request, CLI invocation, system/scheduled job) and confirm the stored event carries the correct one-of-four transport label; confirm the source IP is present when the calling surface has one and null when it doesn't (e.g. a system job).

**Acceptance Scenarios**:

1. **Given** a mutation is performed via an authenticated web session, **When** its audit event is written, **Then** the event's transport is recorded as `web`.
2. **Given** a mutation is performed via an API-key-authenticated request, **When** its audit event is written, **Then** the event's transport is recorded as `api`.
3. **Given** a mutation is performed via the CLI, **When** its audit event is written, **Then** the event's transport is recorded as `cli`.
4. **Given** an automated process (e.g. the retention-pruning job) writes its own audit event, **When** that event is written, **Then** its transport is recorded as `system` and it has no actor and no source IP.
5. **Given** any existing call site that already writes audit events (`login`, `logout`, invitations, API keys), **When** this feature ships, **Then** those call sites pass a real, non-placeholder transport value rather than leaving the column unset or defaulted.

---

### User Story 3 - A documented, extensible list of audit action verbs (Priority: P3)

An engineer adding a new mutation type in any bounded context wants to know which `action` verb to use (and future engineers reviewing the audit UI's color-coding want to know what each verb means), without having to reverse-engineer it from scattered call sites.

**Why this priority**: Lower risk than the two gaps above (nothing is broken today without this), but it's a real, recurring cost — every future bounded context adding a mutation currently has to invent an `action` verb from scratch or copy an existing one by guesswork, and the audit-log UI needs a fixed, known set of verbs to color-code.

**Independent Test**: Read the documented verb list and confirm every `action` string actually produced by code in this repository maps to one of the documented verbs, with no undocumented verb in use and no documented verb that's pure aspiration with zero real callers.

**Acceptance Scenarios**:

1. **Given** the documented verb vocabulary, **When** it is compared against every `action` string currently produced by shipped code, **Then** every real verb in use today (`created`, `revoked`, `accepted`, `login`, `login_failed`, `logout`) appears in the documented list, and the list contains no verb (e.g. `invited`) that no shipped call site actually produces.
2. **Given** a future bounded context needs a new mutation-type verb not yet in the list, **When** the contributor consults the documented vocabulary, **Then** they can either reuse an existing verb or extend the list through the same document, rather than inventing an unlisted one silently.

---

### Edge Cases

- What happens when a mutation is triggered by a request that legitimately has no organization yet (e.g. first-run admin/organization bootstrap)? The audit event's `organizationId` is null in that single documented case already established by the existing schema — this feature does not change that.
- What happens when a system/scheduled job (transport `system`) needs to record an event — does it ever have a `source_ip`? No: system-originated events have no network origin, so `source_ip` is null whenever transport is `system`.
- How does the retrofit distinguish "genuinely new code with no retrofit needed" (login/logout, already using `record()` directly) from "pre-existing mutation now being wrapped" (org/team/user mutations)? Both end up calling `record()`, but only the latter group is newly wrapped in `withAudit()` by this feature — login/logout's existing plain-`db.transaction()` pattern is out of scope for change (see Assumptions).
- What happens to already-shipped `record()` calls (login/logout, invitations, API keys) once `transport` becomes a required column? They must all be updated in the same change to pass a real value — a required column with no default would otherwise break every existing call site's insert.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST write exactly one audit event, in the same transaction as the mutation, whenever an organization is created.
- **FR-002**: System MUST write exactly one audit event, in the same transaction as the mutation, whenever a team is created, updated, reparented, or inserted between two existing teams.
- **FR-003**: System MUST write exactly one audit event, in the same transaction as the mutation, whenever a user is created (including via first-run admin bootstrap and invitation acceptance's user-creation path), updated, or deactivated.
- **FR-004**: System MUST NOT write any audit event for a mutation from FR-001–FR-003 that fails or is rolled back partway through.
- **FR-005**: System MUST add a `transport` field to the audit event record, restricted to exactly one of `web`, `api`, `cli`, or `system`, and MUST reject an attempt to record an event without one.
- **FR-006**: System MUST add an optional `source_ip` field to the audit event record, populated when the originating request has a network source and left empty when it does not (e.g. `system`-transport events).
- **FR-007**: Every call site that records an audit event as of this feature (existing: login, logout, invitation create/accept/revoke, API key create/revoke; new: the retrofitted mutations in FR-001–FR-003) MUST pass a real, specific `transport` value appropriate to how that call was made — none may pass a placeholder or leave it unset.
- **FR-008**: System MUST provide a single documented, enumerable reference of canonical audit action verbs: `created`, `updated`, `deleted`, `revoked`, `reparented`, `shared`, `accepted`, `login`, `logout`, `login_failed`, `synced`, `pruned` — corrected from the parent backlog item's originally proposed list to match what shipped code already records (`invited` dropped, since invitation creation is recorded as `invitation.created`; `accepted` added, since shipped code already records `invitation.accepted`). No shipped call site's `action` string is renamed by this feature.
- **FR-009**: The documented verb reference MUST state, for each verb, its associated UI color-coding, so the audit log UI feature can consume it directly rather than re-deriving a mapping.

### Key Entities

- **Audit Event**: One immutable row describing a single mutation or auth event — who (actor, nullable), what happened (`action` verb + resource type/id), when, what changed (`before`/`after`, secret-redacted), and now also *from where* (`transport`, `source_ip`). This feature extends the existing entity with the transport/source fields; it does not change its append-only, single-row-per-mutation nature.
- **Action Verb Vocabulary**: A documented, named list mapping each canonical verb (e.g. `created`, `revoked`, `reparented`) to its meaning and UI color — not a database entity, a reference document/table other code and contributors consult.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of organization, team, and user mutations produce a corresponding audit event — verified by an automated test for every mutation type in FR-001–FR-003, with zero gaps.
- **SC-002**: 100% of audit events written by any call site in the system (existing or new) carry one of the four defined transport values — zero events with a missing, null, or placeholder transport.
- **SC-003**: An engineer unfamiliar with the audit trail can determine the correct action verb for a new mutation type by consulting a single documented source, without inspecting existing call sites for precedent.
- **SC-004**: A failed mutation of any retrofitted type leaves zero trace in the audit trail (no orphaned audit row without its paired mutation, and vice versa) in 100% of forced-failure test cases.

## Assumptions

- Invitation (`invite`/`accept`/`revoke`) and API key (`create`/`revoke`) mutations already call `withAudit()` + `record()` today (shipped in `009-invitations` and `010-api-keys`) — the backlog item's retrofit list is treated as already satisfied for these two categories, and this feature's retrofit scope (FR-001–FR-003) is limited to what remains unwrapped: organization creation, team hierarchy mutations, and user creation/update/deactivation.
- `login`/`logout` continue to call `record()` directly inside a plain transaction rather than through `withAudit()` — per the parent backlog item, neither is a row-changing "mutation" in the sense `withAudit()` pairs with, so no change to that call pattern is in scope here; they are only touched to add a real `transport` value once that field exists.
- The four-value `transport` taxonomy (`web`/`api`/`cli`/`system`) is a new, audit-trail-specific field distinct from any structured-request-log `transport` field elsewhere in the codebase; no existing code's meaning of "transport" is being changed, only this new column.
- Determining the correct `transport` value at each call site (e.g. how a "web" request is distinguished from an "api" one at the point `record()` is called) is an implementation detail to be resolved during planning, not this spec — this spec only requires that the correct one of the four values reaches storage.
- Retention-pruning's own self-log event (`transport: "system"`) is owned by the separate `002-audit-query-and-retention` backlog item, not this feature — this feature only ensures the `transport`/`source_ip` columns and vocabulary exist for that item to use.
