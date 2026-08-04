# Feature Specification: MCP Server & Tools

**Feature Branch**: `001-mcp-server-tools`

**Created**: 2026-08-03

**Status**: Draft

**Input**: User description: "SKI-50 / backlog/008-distribution/002-mcp-server-and-tools.md" - Port the existing MCP server and six public MCP tools as a strict compatibility surface for MCP-capable clients, preserving tool names, argument shapes, session-context behavior, bearer API key authentication, audit coverage, and raw-secret-safe operation. This feature is deprioritized behind Skill Sync, but remains valid future work for clients that need programmatic MCP access.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Connect an MCP-capable client (Priority: P1)

An MCP-capable IDE or automation client connects to SkillCanon over the public MCP endpoint with a bearer API key and can discover the same six tools that existing client configurations already reference.

**Why this priority**: The MCP surface is only useful if existing clients can connect without changing their configured endpoint, credential style, tool names, or argument shapes.

**Independent Test**: Configure an MCP client with a valid SkillCanon API key, connect to the endpoint, list available tools, and confirm the six expected tools and their argument schemas are exposed exactly as the existing implementation exposes them.

**Acceptance Scenarios**:

1. **Given** a valid, active API key for an active user, **When** an MCP client connects to the MCP endpoint, **Then** the connection is accepted and tool discovery returns `sh-list`, `sh-search`, `sh-context`, `sh-run`, `sh-workflow-list`, and `sh-workflow-run`.
2. **Given** an API key that is missing, expired, revoked, malformed, or belongs to an inactive user, **When** an MCP client attempts to connect or invoke a tool, **Then** the request is rejected before any tenant-scoped data is read.
3. **Given** an existing client configuration that names any of the six public tools with its legacy argument shape, **When** the client invokes that tool against the new surface, **Then** the request is accepted or rejected for the same behavioral reasons as the current implementation, never because the public shape changed.

---

### User Story 2 - Resolve governed prompt content through MCP (Priority: P1)

An IDE agent uses the MCP tools to list and search available skills, inspect context, and run a governed prompt expansion, receiving output equivalent to the current MCP behavior for the same caller, project, and input.

**Why this priority**: Prompt discovery and governed expansion are the primary user value of the MCP surface; compatibility without equivalent results would still break real workflows.

**Independent Test**: Seed a project with skills, policies, and objectives; call `sh-list`, `sh-search`, `sh-context`, and `sh-run` through MCP; and compare each result to the current implementation for equivalent input.

**Acceptance Scenarios**:

1. **Given** a caller with access to multiple skills, **When** the caller invokes `sh-list`, **Then** the returned roster matches the current implementation's visible-skill set and fields for that caller.
2. **Given** a caller searches for skills by text, **When** the caller invokes `sh-search`, **Then** the returned matches and empty-search behavior are equivalent to the current implementation.
3. **Given** a caller asks for context, **When** the caller invokes `sh-context`, **Then** the response contains the same applicable policy/objective context the current implementation would provide.
4. **Given** a caller invokes `sh-run` for an accessible skill with valid input, **When** the expansion completes, **Then** the caller receives the same governed prompt content and context-injection behavior the current MCP surface provides.
5. **Given** a caller invokes `sh-run` for a skill they cannot access, **When** the request is processed, **Then** the rejection does not reveal whether the skill exists in another tenant or inaccessible scope.

---

### User Story 3 - Run legacy workflow tools through MCP (Priority: P2)

An MCP client that still uses the legacy workflow tool names can list and run the platform's workflow-equivalent capability without changing tool names or call shapes.

**Why this priority**: The workflow tools are part of the public MCP contract even though Skill Sync is the day-one priority; preserving them avoids breaking existing MCP client configurations.

**Independent Test**: Publish a multi-step skill capability available to the caller, invoke `sh-workflow-list` and `sh-workflow-run` with the legacy request shapes, and compare results to the current implementation's observable behavior.

**Acceptance Scenarios**:

1. **Given** a caller with access to workflow-equivalent skills, **When** the caller invokes `sh-workflow-list`, **Then** the response lists the available runnable workflows using the same public shape as the current implementation.
2. **Given** a caller invokes `sh-workflow-run` with valid legacy arguments, **When** the run is accepted, **Then** the response follows the same public shape and failure semantics as the current implementation.
3. **Given** the underlying platform capability uses a newer internal model for multi-step skills, **When** an MCP caller uses the legacy workflow tool names, **Then** the public MCP contract remains unchanged.

---

### User Story 4 - Preserve session behavior across ordinary process churn (Priority: P2)

An MCP client session benefits from per-session caching and one-time context injection while remaining correct if the serving process restarts or loses its in-memory session state.

**Why this priority**: Existing MCP sessions rely on the context block being injected only once per session, but session state is explicitly ephemeral and must never become a source of truth.

**Independent Test**: Start an authenticated MCP session, invoke tools until context has been delivered, clear the server-side in-memory session state to simulate a restart, and confirm the next call revalidates safely and continues rather than breaking the session.

**Acceptance Scenarios**:

1. **Given** a fresh authenticated MCP session, **When** the caller makes the first tool invocation that includes automatic context, **Then** the response includes the policies/objectives block expected from the current implementation.
2. **Given** the same session after context has already been delivered, **When** the caller makes later tool invocations, **Then** automatic context is not injected repeatedly.
3. **Given** the serving process restarts mid-session, **When** the caller invokes another tool with the same valid credential, **Then** the request succeeds after at most one additional API-key validation round trip and no durable user data is lost.

---

### User Story 5 - Audit usage without leaking secrets (Priority: P2)

A compliance reviewer can verify every MCP prompt expansion is recorded as usage/audit activity, while an operator can inspect logs without any raw API key material appearing.

**Why this priority**: This feature explicitly closes known audit and logging gaps in the existing MCP path; leaving either gap open would make the port incomplete even if the tools otherwise work.

**Independent Test**: Invoke `sh-run` repeatedly through MCP with distinct valid callers and inspect audit/usage records and logs for those invocations.

**Acceptance Scenarios**:

1. **Given** a valid `sh-run` invocation, **When** the expansion completes successfully, **Then** exactly one audit/usage record is created for that expansion with the correct caller, tenant, skill, and version context.
2. **Given** `sh-run` returns a handled failure after resolving the caller, **When** the failure is observable as an attempted expansion, **Then** the audit/usage behavior matches the platform's existing expansion audit policy for the same failure class.
3. **Given** any MCP request containing a raw API key, **When** logs are written at any level, **Then** no log entry contains any portion of the raw key.

### Edge Cases

- A caller's API key is revoked after a session cache is populated: after session state is lost or the cached identity is otherwise unavailable, the next request must fail closed rather than recreating access from stale state.
- A caller sends a valid tool name with malformed or missing required arguments: the tool returns a validation failure consistent with the current MCP implementation and performs no partial work.
- A caller sends an unknown tool name: the MCP surface rejects it without exposing internal route or implementation details.
- A context block has already been delivered in a session and the caller invokes a different tool: automatic context injection is still suppressed for that session, matching the existing session-level flag behavior.
- A process restart causes the session context flag to be lost: the next request may receive one extra automatic context block, but the session must continue to function.
- A raw API key appears in an incoming authorization header, error path, debug context, or thrown exception: logs and user-visible errors must still omit the raw key entirely.
- A requested skill/workflow belongs to another tenant or inaccessible scope: the response must not confirm that the resource exists.
- The MCP surface remains deprioritized behind Skill Sync: this feature does not become the primary launch path for Claude Code unless a later decision changes that priority.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST expose a public MCP endpoint that supports Streamable HTTP MCP clients.
- **FR-002**: The MCP endpoint MUST authenticate callers with bearer API keys and MUST use the Identity & Access credential resolution path designated for lookups that have no tenant context yet.
- **FR-003**: The MCP endpoint MUST reject missing, expired, revoked, malformed, or inactive-user API keys before any tenant-scoped data is read or changed.
- **FR-004**: The MCP surface MUST expose exactly these six public tool names: `sh-list`, `sh-search`, `sh-context`, `sh-run`, `sh-workflow-list`, and `sh-workflow-run`.
- **FR-005**: Each MCP tool's public argument shape MUST match the current implementation exactly; any tool rename or signature change is out of scope for this feature.
- **FR-006**: `sh-list` MUST return the same visible-skill roster, fields, ordering, and empty-state behavior as the current implementation for an equivalent caller.
- **FR-007**: `sh-search` MUST return equivalent search results and validation behavior as the current implementation for equivalent query input and caller access.
- **FR-008**: `sh-context` MUST return equivalent applicable policy/objective context as the current implementation for the caller's organization, team, project, and skill context.
- **FR-009**: `sh-run` MUST resolve governed prompt content using the caller's current access and governance context, and MUST produce output equivalent to the current implementation for equivalent input.
- **FR-010**: `sh-run` MUST create the platform's required audit/usage record for every prompt expansion covered by the existing expansion audit policy.
- **FR-011**: `sh-workflow-list` and `sh-workflow-run` MUST preserve the existing public MCP tool names and request/response shapes even if the underlying platform represents multi-step work as skill chains.
- **FR-012**: The MCP session state MUST cache only ephemeral per-process values: resolved caller identity for the connection and whether automatic session context has already been delivered.
- **FR-013**: The MCP session state MUST NOT be required for correctness; if it is lost, the next request must safely re-resolve the caller and continue.
- **FR-014**: Automatic session context injection MUST match the current behavior: deliver the policies/objectives context block on the first applicable call in a session and suppress repeat injection afterward, except that a process restart may cause one extra context delivery.
- **FR-015**: No MCP request, response, error, or log path MAY include any portion of a raw API key, password, session token, or other caller secret.
- **FR-016**: Cross-tenant access through any MCP tool MUST be denied in a way that does not reveal whether the target resource exists outside the caller's accessible scope.
- **FR-017**: The feature MUST be covered by characterization-style comparisons against the current MCP implementation for all six tools.
- **FR-018**: This feature MUST NOT introduce a redesigned MCP contract, a new primary CLI distribution path, a static cached prompt-delivery mode, or a new persistent shared session store.

### Key Entities

- **MCP Client**: An IDE, agent runtime, or automation tool configured to connect to SkillCanon's MCP endpoint and invoke public MCP tools.
- **MCP Session**: One client connection whose ephemeral state may remember the resolved caller and whether session context has already been delivered.
- **API Key**: A bearer credential tied to a SkillCanon user and scopes; it authenticates programmatic MCP calls without exposing a session cookie.
- **MCP Tool Invocation**: One call to a named MCP tool with its public argument payload and observable output or error.
- **Governed Context**: The caller-specific policies and objectives applied to prompt expansion and context reporting.
- **Prompt Expansion**: Resolution of a governed skill/prompt into the content returned to the MCP caller.
- **Audit/Usage Record**: The durable record proving an MCP prompt expansion occurred with a specific caller, tenant, skill, and version context.

### Scope Boundaries

- MCP remains deprioritized behind the Skill Sync CLI for Claude Code; this specification keeps the feature ready for a future MCP-capable client need.
- Compatibility means public MCP behavior equivalence, including names, arguments, responses, validation failures, and context-injection behavior. It does not mean preserving internal implementation structure.
- A durable distributed session store is out of scope. Session state is intentionally ephemeral and safe to lose.
- New MCP-only product capabilities beyond the six legacy tools are out of scope.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Tool discovery returns all six required public tool names with argument schemas matching the current implementation, verified by automated characterization checks.
- **SC-002**: For each of the six tools, equivalent valid inputs produce output equivalent to the current implementation for 100% of covered characterization cases.
- **SC-003**: For each of the six tools, equivalent invalid inputs produce validation or authorization failures equivalent to the current implementation for 100% of covered characterization cases.
- **SC-004**: `sh-run` produces exactly one required audit/usage record for every prompt expansion covered by the platform's expansion audit policy, verified by automated test.
- **SC-005**: Automated log-safety checks for MCP request, success, and failure paths find zero raw API key substrings or prefixes in logs.
- **SC-006**: A simulated process restart during an MCP session causes no broken session behavior and at most one additional API-key validation round trip before the next successful tool call.
- **SC-007**: Session-context injection occurs on the first applicable call and is suppressed on later applicable calls in the same uninterrupted session, verified by automated test.
- **SC-008**: Cross-tenant resource probes through MCP tools are denied for 100% of tested resource types and do not reveal whether the inaccessible resource exists.

## Assumptions

- The current Python MCP implementation remains the source of truth for tool names, argument shapes, response shapes, validation behavior, and session-context auto-injection behavior.
- PDR-008 remains accepted: MCP session state is in-memory per process, and losing it is acceptable because API-key authentication is the ground truth on cache miss.
- PDR-010 remains accepted: Skill Sync via live REST resolution is the priority for Claude Code; this MCP feature is retained for future clients where MCP access is still the right external surface.
- Existing Identity & Access API-key semantics, including expired/revoked/deactivated-user handling, apply unchanged to MCP callers.
- Existing governance resolution and prompt expansion semantics apply unchanged to MCP prompt runs.
- Existing workflow-compatible MCP tools remain public even though the platform's newer multi-step capability may be represented internally as skill chains.
