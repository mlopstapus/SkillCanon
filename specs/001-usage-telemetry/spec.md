# Feature Specification: Usage Telemetry

**Feature Branch**: `001-usage-telemetry`

**Created**: 2026-08-04

**Status**: Draft

**Input**: User description: "backlog/008-distribution/004-usage-telemetry.md" - Record product usage telemetry for every genuine skill expansion and skill-chain step completion/failure through the Distribution external surface, expose org-scoped aggregate metrics, and keep the MCP parity requirement documented for the deprioritized MCP transport if it is later built.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Record real skill expansion telemetry (Priority: P1)

An operator needs every genuine skill expansion made through the product's external runtime surface to leave a telemetry row, so usage dashboards, operational reporting, and future checks can rely on the same invocation record regardless of whether the caller is the web UI, REST API, or Skill Sync CLI.

**Why this priority**: This is the core data capture requirement. Without rows for real invocations, every usage aggregate is empty or misleading even when customers are actively using skills.

**Independent Test**: Invoke a published skill through the REST expand flow, including the Skill Sync CLI flow that calls the same REST endpoint, and verify exactly one usage record is created for each genuine invocation with the caller's organization, skill, version, optional project/user context, outcome status, latency, and timestamp.

**Acceptance Scenarios**:

1. **Given** an authenticated caller in an organization and an accessible published skill, **When** the caller expands the skill through REST, **Then** a usage record exists for that organization, skill, skill version, request outcome, elapsed time, and invocation time.
2. **Given** the Skill Sync CLI invokes a skill by calling the REST expand endpoint, **When** the invocation completes or fails after reaching the expansion path, **Then** the same usage record is produced without CLI-specific telemetry wiring.
3. **Given** the prompt detail page's preview/test flow renders a skill for authoring validation, **When** that preview completes, **Then** no usage record is created because test/preview activity is not genuine product usage.
4. **Given** expansion fails after the requested skill and caller context are known, **When** the system returns a client or server error, **Then** a usage record still captures the failed outcome and latency without exposing sensitive error details in telemetry.

---

### User Story 2 - Record skill-chain terminal step telemetry (Priority: P2)

An operator needs multi-step skill-chain executions to contribute usage records for each completed or failed step, so aggregate usage reflects real runtime activity beyond single-template expansions.

**Why this priority**: Skill chains are a governed invocation surface, and missing their step outcomes would undercount usage and break parity with single-skill telemetry. This follows P1 because the single expansion write path is the reusable basis for step-level recording.

**Independent Test**: Run a skill chain through the Distribution runtime surface until a step completes and another step fails; verify a usage record is created for each terminal step outcome in the caller's organization.

**Acceptance Scenarios**:

1. **Given** a skill chain run reaches a successful terminal outcome for a step, **When** the outcome is accepted by the system, **Then** a usage record exists for that step's skill/version, organization, optional project/user context, successful status, latency when available, and timestamp.
2. **Given** a skill chain run reaches a failed terminal outcome for a step, **When** the failure is accepted by the system, **Then** a usage record exists for that step's skill/version, failed status, latency when available, and timestamp.
3. **Given** a skill chain run is abandoned before a step completes or fails, **When** no terminal step outcome exists, **Then** no completed/failed step usage record is fabricated.

---

### User Story 3 - View organization usage aggregates (Priority: P3)

An organization admin needs a basic metrics endpoint and page showing aggregate usage, so they can understand adoption and runtime health without querying the database directly.

**Why this priority**: Aggregate visibility is only useful after capture is reliable. It completes the feature by making the recorded telemetry externally observable to authorized users.

**Independent Test**: Seed usage records for two organizations and request aggregate metrics as an admin from one organization; verify totals, breakdowns, and latency/outcome aggregates include only that admin's organization.

**Acceptance Scenarios**:

1. **Given** an organization has successful and failed usage records across multiple skills, **When** an authorized admin opens the metrics page or calls the metrics endpoint, **Then** they see aggregate counts by skill, version, outcome status, and time window for their organization only.
2. **Given** another organization has usage records for the same skill identifiers or names, **When** the first organization's admin requests metrics, **Then** no counts, timestamps, names, or status data from the other organization are included or inferable.
3. **Given** no usage exists for an organization, **When** an authorized admin requests metrics, **Then** the endpoint and page return a clear zero-usage state rather than sample data or an error.

### Edge Cases

- A request targets a skill that does not exist or belongs to another organization: telemetry must not reveal cross-tenant existence; if a record is created, it must be scoped only to the caller's organization and use only data already visible to that caller.
- A request is rejected before the caller's organization is known, such as an invalid credential: no organization-scoped usage record is created because there is no safe tenant boundary for it.
- A client retries after a network timeout: the system may record each accepted server-side invocation attempt, but must not create duplicate records for the same single accepted attempt.
- A skill version is later renamed, unpublished, or deleted: historical telemetry remains attributable to the version identity captured at invocation time.
- Rows with git context support future VCS checks and are subject to the documented retention floor; general non-git telemetry can still be rolled up or truncated without changing bounded-context correctness.
- The MCP server is currently deprioritized. If it is later built, its `sh-run` path must record equivalent usage through the same telemetry semantics as REST, but MCP parity tests are not required until that transport exists.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST record one usage event for every genuine, non-preview skill expansion accepted through the REST expand path, whether the caller is the web UI, a direct REST client, or the Skill Sync CLI using that REST path.
- **FR-002**: The system MUST NOT record usage for authoring preview, test, validation-only, or otherwise non-genuine invocations.
- **FR-003**: Each usage event MUST identify the caller's organization, the invoked skill, the invoked skill version, the invocation timestamp, the outcome status, and the elapsed invocation time when the invocation reaches enough of the runtime path to measure it.
- **FR-004**: Each usage event MUST include the acting user, project context, and git context when that context is known to the invocation path; missing optional context MUST be represented as absent rather than guessed.
- **FR-005**: The system MUST preserve compatibility with the existing `PromptUsage` capability already created for project metrics, extending it for Distribution runtime outcome and latency needs rather than creating a parallel usage source.
- **FR-006**: The system MUST record usage for every completed or failed skill-chain step outcome accepted by the Distribution runtime surface.
- **FR-007**: The system MUST NOT fabricate completed or failed step usage for abandoned skill-chain runs that have no terminal step outcome.
- **FR-008**: The metrics endpoint MUST return aggregate usage scoped to the authenticated caller's organization.
- **FR-009**: The metrics page MUST present the same organization-scoped aggregate usage available from the metrics endpoint, including total invocations, breakdowns by skill/version, breakdowns by outcome status, and latency summaries.
- **FR-010**: Metrics reads MUST NOT expose any usage count, skill identity, status, timestamp, or latency information from another organization.
- **FR-011**: Metrics reads MUST support a bounded time window so an organization can distinguish recent usage from all historical usage.
- **FR-012**: Usage telemetry MUST remain distinct from compliance audit logging: recording or reading usage does not by itself satisfy audit-log requirements, and usage writes must not be treated as domain mutations requiring audit events.
- **FR-013**: If the MCP transport is later implemented, its `sh-run` invocation path MUST produce usage events equivalent to REST expansion events for the same caller, skill, version, context, outcome, latency, and timestamp semantics.
- **FR-014**: Automated tests MUST prove that REST expansion creates usage, Skill Sync CLI usage through REST creates usage by exercising the shared REST path or its boundary, org-scoped metrics do not leak cross-tenant data, preview/test invocations do not create usage, and MCP parity is covered only when MCP exists.

### Key Entities *(include if feature involves data)*

- **Usage Event**: A telemetry record that a genuine runtime invocation happened. It identifies organization, skill, skill version, timestamp, outcome status, latency when measurable, and optional caller/project/git context.
- **Skill Expansion**: A single governed resolution of a skill's content for an authenticated caller through the Distribution external surface.
- **Skill Chain Step Outcome**: A completed or failed terminal result for one step in a multi-step skill-chain run.
- **Metrics Aggregate**: An organization-scoped summary derived from usage events, such as counts by skill/version/status, totals over a time window, and latency summaries.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of genuine REST skill expansions tested in the acceptance suite create exactly one organization-scoped usage event.
- **SC-002**: A Skill Sync CLI invocation that reaches the REST expand path creates the same usage event as an equivalent direct REST invocation, with no separate CLI-only telemetry behavior required.
- **SC-003**: 100% of tested preview/test invocations create zero usage events.
- **SC-004**: Metrics endpoint and page tests with at least two organizations show zero cross-organization leakage of counts, identities, statuses, timestamps, and latency values.
- **SC-005**: Aggregate metrics accurately report total invocation count, outcome-status counts, skill/version breakdowns, and latency summaries for a selected bounded time window.
- **SC-006**: If MCP `sh-run` is later implemented, parity tests demonstrate that equivalent REST and MCP invocations produce equivalent usage events before that transport is considered complete.

## Assumptions

- The originally stated `WorkflowRunCompleted` and `WorkflowRunFailed` event names are superseded by the current skill-chain model; this spec treats completed and failed skill-chain step outcomes as the relevant telemetry source.
- No event bus exists in the current codebase. "Recorded for events" means the runtime path that accepts the completed/failed outcome directly records usage at that boundary.
- The existing `distribution.prompt_usage` table was already introduced by `024-project-usage-metrics-dashboard` and currently captures organization, skill, skill version, optional project/user context, and timestamp. This feature extends that usage source for runtime status and latency rather than replacing it with the older issue-body column set.
- Git context is optional and applies only to invocation paths that can know it, such as the Skill Sync CLI running inside a git repository.
- Organization-scoped application-layer filtering is required for every usage write/read; database-level RLS for Distribution telemetry remains a separate hardening concern unless already present by implementation time.
- The basic metrics page is for authorized organization admins and is not a public analytics surface.
