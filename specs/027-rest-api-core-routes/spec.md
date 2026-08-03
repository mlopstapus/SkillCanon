# Feature Specification: REST API Core Routes

**Feature Branch**: `027-rest-api-core-routes`

**Created**: 2026-08-02

**Status**: Draft

**Input**: User description: "backlog/008-distribution/001-rest-api-core-routes.md" — Port the REST surface from the current Python routers (`teams`, `projects`, `prompts`, `policies`, `objectives`, `workflows`, `apikeys`, `users`) to route handlers that call only their owning bounded context's exposed contract (Identity & Access, Governance, Prompt Registry — workflows are now skill chains owned by Prompt Registry per PDR-017, not a separate workflow-orchestration context), authenticated consistently, with a shared error-mapping layer producing one consistent REST error shape across every route regardless of which resource or bounded context triggered the underlying failure.

## Clarifications

### Session 2026-08-02

- Q: Does the chain-run capability need a synchronous "run to completion" convenience endpoint alongside the step-by-step protocol? → A: No — the step-by-step protocol (start/advance/abandon/list/get) is the complete replacement; there is no synchronous-equivalent endpoint.
- Q: Which routes should accept API-key bearer auth, not just a session cookie? → A: Every route (including admin/CRUD writes to teams, policies, users, etc.) accepts either a valid session or a valid API key, mirroring the legacy system's own uniform dual-mode caller resolution.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Manage core resources through the API (Priority: P1)

A caller (today, the bundled web UI; going forward, the Skill Sync CLI and any self-hosted operator's own tooling) creates, reads, updates, deletes, and lists the platform's core resources — teams, projects (and their members/collaborator teams), skills/prompts (and their versions), policies, objectives, API keys, and users — through the API, with results equivalent to what the current system already provides for the same operation.

**Why this priority**: Nothing else in this epic — the web UI, the CLI, skill invocation itself — can function until an authenticated caller can create and manage these resources over the network. This is the floor the rest of the product stands on.

**Independent Test**: For each resource, create it, read it back, list it alongside a sibling, update a field, and delete it (where deletion applies) through the API alone, and confirm each response matches the equivalent existing-system behavior for the same request.

**Acceptance Scenarios**:

1. **Given** an authenticated caller with sufficient privilege, **When** they create a team/project/skill/policy/objective/API key, **Then** the resource exists and is returned with the same fields the equivalent existing operation returns.
2. **Given** an authenticated caller, **When** they list a resource collection scoped to their own organization, **Then** they see only resources belonging to their organization, in the same default ordering/pagination shape as today.
3. **Given** an authenticated caller without sufficient privilege for a restricted operation (e.g. a non-admin creating a team), **When** they attempt it, **Then** the operation is rejected and no resource is created or changed.
4. **Given** a caller with no valid session or credential, **When** they call any of these endpoints, **Then** they are rejected before any resource is read or changed.

---

### User Story 2 - Invoke a skill and run a multi-step chain through the API (Priority: P2)

A caller resolves a governed skill's content for a given input (an "expand" call), and — for skills authored as multi-step chains — starts a run, receives each step's governed content in turn, reports back what happened at each step, and receives either the next step or a "run finished" result, entirely through the API.

**Why this priority**: This is the capability that actually delivers governed-prompt value to an external caller (an IDE agent, the CLI, the web UI's live preview) rather than just administering configuration — but it depends on User Story 1's resources (skills, policies, objectives) already being manageable through the API, so it necessarily follows it.

**Independent Test**: Publish a skill (template or chain) via the API from User Story 1, then call expand (or start/advance a chain run) through the API alone and confirm the returned content reflects the caller's governance context, with a chain run reaching a finished state after every step is reported.

**Acceptance Scenarios**:

1. **Given** a published template skill, **When** a caller expands it with valid input, **Then** they receive the resolved content plus the policies/objectives that were applied.
2. **Given** a published chain skill, **When** a caller starts a run, **Then** they receive the first step's resolved content and a run identifier.
3. **Given** an in-progress chain run, **When** the caller reports the current step's outcome, **Then** they receive either the next step's content or an explicit "run finished" result.
4. **Given** a caller with no access to a skill (not its owner, not their team's, no subscription), **When** they attempt to expand it or start a run, **Then** they receive the same response as if the skill did not exist.

---

### User Story 3 - Get a predictable, consistent error for any failure (Priority: P3)

A caller who triggers the same kind of failure — a resource that does not exist (or belongs to another organization), a validation error, an authorization failure, an unexpected server error — receives a response with the same shape and status code no matter which resource's endpoint they called.

**Why this priority**: Every individual resource endpoint in User Stories 1 and 2 can be built and independently useful without this, but a caller integrating against more than one resource (which every real caller does) needs to write one error-handling code path, not one per resource — this is what makes the whole surface usable as a cohesive API rather than eight independently-behaving routers.

**Independent Test**: Trigger the same class of failure (e.g. "not found," "not authorized," "invalid input") against two different, unrelated resource endpoints and confirm the response body shape, error code convention, and HTTP status are identical.

**Acceptance Scenarios**:

1. **Given** a request for a nonexistent resource, **When** made against any resource endpoint, **Then** the response has the same error shape and status code as any other resource's "not found" response.
2. **Given** a request that fails validation, **When** made against any resource endpoint, **Then** the response identifies which field(s) failed in a consistently structured way.
3. **Given** an unexpected internal failure, **When** it occurs on any endpoint, **Then** the caller receives a generic error with no internal details (stack traces, internal identifiers, raw database errors) exposed in the response body.

---

### Edge Cases

- A request targets a resource that exists but belongs to a different organization than the caller's: the response must be indistinguishable from the resource not existing at all (no signal that reveals cross-tenant existence).
- A caller's session cookie or API key is expired or has just been revoked: the request is rejected as unauthenticated, not silently allowed on stale cached identity.
- A chain-run "report this step's outcome" call names a step the run has already moved past (a stale retry or a race between two callers): the call is rejected as a conflict, never silently applied to whatever step is now current.
- A "report this step's outcome" or "abandon this run" call targets a run that has already reached a finished state: it is rejected with an explicit "already finished" response, never treated as a silent no-op success.
- A caller submits a request body that is well-formed JSON but semantically invalid (e.g. an unknown enum value, a reference to a nonexistent related resource): this is a validation failure, not an unexpected server error.
- The legacy system's "run this workflow" request has no single equivalent call in the resource's current form, since a multi-step chain run is now an interactive, caller-driven sequence of calls rather than one server-side synchronous execution. Per the 2026-08-02 clarification, the API does not offer a synchronous "run to completion" convenience call — the step-by-step protocol (start/advance/abandon/list/get) is the complete replacement, and a caller wanting an end-to-end result must drive the sequence itself.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The API MUST let an authenticated, sufficiently-privileged caller create, read, list, update, and delete teams, scoped to the caller's own organization.
- **FR-002**: The API MUST let an authenticated caller create, read, list, update, and delete projects, including managing a project's members and collaborator teams, scoped to the caller's own organization.
- **FR-003**: The API MUST let an authenticated caller create, read, list, update, and delete skills (prompts) and publish new versions of a skill, including rolling back to a prior version, scoped to the caller's own organization and the caller's own access to that skill.
- **FR-004**: The API MUST let an authenticated caller manage a skill's sharing relationships — subscribing, unsubscribing, and forking — and a project's skill assignments, consistent with each operation's existing authorization rules.
- **FR-005**: The API MUST let an authenticated caller create, read, update, and delete policies and objectives, and read the effective (resolved) set of policies/objectives that apply to a given user or project context.
- **FR-006**: The API MUST let an authenticated caller create, list, and revoke their own API keys, and let an organization admin manage API keys belonging to users in their own organization.
- **FR-007**: The API MUST let an authenticated, sufficiently-privileged caller create, read, list, update, and deactivate users within their own organization.
- **FR-008**: The API MUST let an authenticated caller resolve (expand) a skill's governed content for a given input, applying the caller's own governance context (policies/objectives), and must reject expansion of a skill the caller cannot access identically to that skill not existing.
- **FR-009**: The API MUST let an authenticated caller start a run of a multi-step (chain) skill, report each step's outcome in turn, receive the next step or a finished result, and explicitly abandon an in-progress run; and MUST let an authenticated caller read a run's current state and history without side effects. The API MUST NOT provide a separate synchronous "run to completion" endpoint — the step-by-step protocol is the sole way to execute a chain (2026-08-02 clarification).
- **FR-010**: Every endpoint that mutates or reads organization-scoped data MUST reject a request with no valid, current session or API-key credential, before any resource is accessed. Every such endpoint, including admin/CRUD writes, MUST accept either credential type equally — there is no narrower, session-only subset of routes (2026-08-02 clarification).
- **FR-011**: Every endpoint MUST reject an attempt to read or affect a resource belonging to a different organization than the caller's, in a way that is indistinguishable from that resource not existing.
- **FR-012**: A given underlying failure (not found, unauthorized, forbidden, validation failure, conflict, unexpected error) MUST produce the same response shape and HTTP status code regardless of which resource's endpoint triggered it.
- **FR-013**: A validation failure response MUST identify which submitted field(s) caused the failure, in a consistently structured way across every endpoint.
- **FR-014**: An unexpected/unhandled failure response MUST NOT expose internal details (stack traces, raw database errors, internal identifiers not otherwise visible to the caller) in the response body.
- **FR-015**: List endpoints for a collection that can grow without bound (skills, teams, projects, users) MUST support paging rather than always returning the full collection in one response.
- **FR-016**: Every endpoint that authenticates a caller from a bare identifier with no organization context yet (e.g. resolving a session or an API key before the caller's organization is known) MUST use the connection path designated for that pre-tenant-context lookup, never the ordinary organization-scoped connection path.
- **FR-017**: No endpoint's implementation MAY reach into another bounded context's internal data/schema layer directly — every cross-resource operation MUST go through that context's own exposed, documented operations.

### Key Entities *(include if feature involves data)*

- **Team**: An organizational unit within a tenant, arranged hierarchically (parent/child), owning policies/objectives at its level and a subset of users.
- **Project**: A grouping that skills can be assigned to and that users/teams collaborate within; has an owning team, member users, collaborator teams, and linked repositories.
- **Skill (Prompt)**: A named, versioned, governed unit of reusable prompt content; a version is either a template (renders directly) or a chain (an ordered sequence of steps, each itself resolving to a skill invocation).
- **Skill Version**: One published, immutable revision of a skill's content (template or chain steps).
- **Policy** / **Objective**: Governance rules resolved hierarchically down a team chain (and, for objectives, optionally scoped to a project) and applied when a skill is expanded.
- **API Key**: A caller-held credential, scoped to a set of permitted actions, tied to one user, usable as an alternative to a session for programmatic access.
- **User**: An individual account within one organization, holding a role and (optionally) a team assignment.
- **Chain Run**: A single caller-driven execution instance of a chain skill's steps, tracking which step is current, each step's self-reported outcome, and the run's overall status (in progress, completed, abandoned).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For every resource covered by this feature, an authenticated caller can complete a full create-read-update-delete lifecycle (or the resource's equivalent subset, e.g. list/deactivate for users) through the API alone, with results matching the equivalent existing-system operation for the same request, for 100% of the resources listed in the Functional Requirements.
- **SC-002**: A caller who triggers the same class of failure (not found, unauthorized, validation, conflict, unexpected error) against any two different resource endpoints receives a response with an identical shape and status-code convention, verified across every resource.
- **SC-003**: Zero requests in a cross-tenant test pass (an authenticated caller from one organization can read, modify, or even detect the existence of another organization's resource) across every resource endpoint.
- **SC-004**: A caller can complete an end-to-end skill invocation and an end-to-end multi-step chain run using only the API, with no direct database or internal-module access required.
- **SC-005**: An automated boundary check confirms zero route handlers import another bounded context's internal schema or model files directly.

## Assumptions

- No API version prefix is introduced (routes live under a single, unversioned base path) — matching the already-decided API conventions, since the only consumer at launch is the bundled frontend and no third-party API consumer yet exists to require a compatibility-guaranteed version.
- "Equivalent to the current system" means functional/behavioral equivalence for a given request, not literal URL-path or HTTP-method identity with the legacy routes — the originating requirement explicitly allows improving on current conventions, and the only present consumer (the bundled frontend) is being rebuilt alongside this feature rather than depending on the old paths.
- List/pagination follows the existing page-and-page-size convention already decided for this system, rather than introducing a new pagination style.
- Rate limiting is out of scope for this feature — it has already been explicitly deferred at the platform level and is not part of this port.
- User creation, update, and deactivation are direct administrative operations available through this API (distinct from and in addition to the existing invitation-based self-service flow), matching a capability the underlying user-management operations already provide.
