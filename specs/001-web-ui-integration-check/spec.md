# Feature Specification: Web UI Final Composition & Integration Check

**Feature Branch**: `001-web-ui-integration-check`

**Created**: 2026-08-03

**Status**: Draft

**Input**: User description: "Web UI Final Composition and Integration Check. Scope reduced: this feature no longer builds the application shell or bounded-context pages. It verifies that every already-built bounded-context UI is composed into the real app shell and works end to end against the REST API. It must confirm stale standalone shell or middleware stand-ins are removed, perform page-by-page parity against the legacy frontend app tree, preserve authentication redirects for protected routes, and validate the manual smoke flow: create team, create project, create policy, create prompt, expand prompt, and confirm the applied policy appears in the result. Dependencies: REST API core routes and app shell/navigation/landing work."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Verify every core page is reachable through the real shell (Priority: P1)

A signed-in user opens the authenticated product and can reach each rebuilt bounded-context page from the shared application shell, with no page still depending on a placeholder layout, one-off shell, or duplicate authentication gate.

**Why this priority**: This feature is the composition checkpoint for UI work delivered across separate bounded-context epics. If any page is not composed into the real shell, the product is not usable end to end even if the individual page works in isolation.

**Independent Test**: Sign in as an active user, navigate through every shell entry and supported nested workflow route, and confirm each page renders inside the shared shell with the correct active navigation state and no duplicate or stale chrome.

**Acceptance Scenarios**:

1. **Given** an active signed-in user, **When** they navigate to each rebuilt bounded-context page, **Then** the page renders inside the shared app shell from the app shell/navigation feature.
2. **Given** a rebuilt page that was originally implemented before the final shell existed, **When** it is opened through the product navigation, **Then** it uses the shared shell and no standalone shell or middleware stand-in remains active.
3. **Given** a nested route such as a prompt detail, project detail, workflow detail, policy detail, or objective detail, **When** the route loads, **Then** the shared shell remains present and marks the owning product section active.
4. **Given** an authenticated page is unavailable because its owning feature was not actually built, **When** the integration audit reaches that workflow, **Then** the gap is recorded against the owning bounded-context feature rather than implemented inside this checkpoint.

---

### User Story 2 - Confirm legacy workflow parity across the rebuilt UI (Priority: P1)

A product reviewer compares the rebuilt authenticated UI against the legacy frontend route tree and confirms that every legacy core workflow still has a composed, working replacement in the new product surface.

**Why this priority**: The scope reduction distributed page ownership across earlier epics, making this the place where missed legacy behavior is detected before the distribution epic is considered usable.

**Independent Test**: Create a route/workflow parity matrix from the legacy frontend app tree and mark each legacy workflow as present, intentionally replaced, intentionally removed, or missing in the rebuilt shell.

**Acceptance Scenarios**:

1. **Given** the legacy frontend includes auth/onboarding, settings, teams, projects, prompts, workflows, and metrics routes, **When** the parity audit is performed, **Then** each route family has a documented rebuilt destination or documented exclusion rationale.
2. **Given** a legacy workflow for creating, viewing, or editing a prompt, policy, objective, workflow, team, or project, **When** the reviewer exercises that workflow in the rebuilt UI, **Then** the workflow can be completed without leaving the composed app shell or using a direct API/database action.
3. **Given** a legacy route has no rebuilt equivalent, **When** the audit is complete, **Then** the missing item is captured as a bounded-context ownership gap with enough detail for the owning epic to fix it.
4. **Given** a legacy route was intentionally replaced by a new destination or flow, **When** the audit records that route, **Then** the replacement is named and the reviewer can verify the user outcome is still available.

---

### User Story 3 - Validate protected-route behavior for the composed app (Priority: P2)

An unauthenticated visitor, expired session, or otherwise invalid session cannot see any route inside the authenticated app, including routes contributed by every bounded context.

**Why this priority**: The app shell already owns the authentication gate, but this feature must verify that composed pages did not bypass or duplicate it while being built independently.

**Independent Test**: Request every authenticated route family without a valid session and confirm each redirects to login before protected content is returned; repeat with a valid session and confirm the same route renders inside the shell.

**Acceptance Scenarios**:

1. **Given** no valid session, **When** a visitor requests any authenticated route, **Then** they are redirected to login and no protected page content renders first.
2. **Given** an expired or invalid session, **When** the user requests any authenticated route, **Then** the session is treated like no session and the user is redirected to login.
3. **Given** a valid active session, **When** the user requests an authenticated route, **Then** the route renders inside the shared shell rather than redirecting.
4. **Given** a bounded-context page has its own legacy or temporary middleware, **When** protected-route behavior is tested, **Then** only the shared app shell/auth gate controls access.

---

### User Story 4 - Smoke test the end-to-end governed prompt flow (Priority: P2)

A signed-in user completes the primary cross-bounded-context flow: create a team, create a project, create a policy, create a prompt, expand the prompt through the UI, and verify the policy appears in the generated result.

**Why this priority**: This is the smallest meaningful proof that identity/access, prompt registry, governance, and REST API integration are composed into a usable external surface.

**Independent Test**: Start from a clean organization that has permission to use core features, complete the full flow through the UI only, and confirm the final expansion output includes the applied governance policy.

**Acceptance Scenarios**:

1. **Given** an active signed-in user with permission to create teams and projects, **When** they create a team and then create a project owned by or associated with that team, **Then** both objects appear in the UI and can be opened again from navigation.
2. **Given** the user has a team/project context, **When** they create a governance policy, **Then** the policy appears in the governance UI and is available for prompt expansion.
3. **Given** the user has created a prompt, **When** they expand or preview it through the UI, **Then** the expansion uses the real REST-backed behavior rather than mock data.
4. **Given** a policy applies to the prompt expansion context, **When** the expansion result is shown, **Then** the applied policy is visible in the result or applied-policy summary.

### Edge Cases

- A bounded-context page was built against an earlier temporary shell: it is absorbed into the shared shell, and the temporary shell or middleware is removed rather than left as a parallel path.
- A legacy route no longer maps one-to-one to a rebuilt route: the parity audit records the replacement user outcome, not just the URL difference.
- A user directly enters a protected nested route URL: the route follows the same auth redirect and shell composition rules as top-level navigation.
- The smoke-test organization starts with no teams, projects, policies, prompts, or workflows: create flows show usable empty states and then update after each created object.
- The REST API returns an authorization, validation, or not-found error during a workflow: the UI shows a user-understandable error without leaving the shell or exposing raw internal details.
- A page is present but still uses seeded/mock-only data for a core workflow: it fails the integration check until the workflow is wired to real REST-backed behavior or the owning feature records the gap.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST compose every rebuilt bounded-context UI page into the shared authenticated app shell delivered by the app shell/navigation feature.
- **FR-002**: System MUST NOT leave any standalone shell, duplicate sidebar, duplicate account footer, or temporary auth/middleware stand-in active for a bounded-context page after it is composed into the shared shell.
- **FR-003**: System MUST provide a page-by-page parity audit comparing the rebuilt UI against the legacy frontend route families for welcome/root, login/register/invite, settings, teams, projects, prompts, workflows, metrics, and health/API support routes.
- **FR-004**: The parity audit MUST classify each legacy route family as rebuilt, intentionally replaced, intentionally removed, or missing, and MUST identify the owning bounded-context feature for any missing item.
- **FR-005**: Users MUST be able to create, view, and edit prompts through the rebuilt UI, including opening prompt detail and expansion/preview behavior.
- **FR-006**: Users MUST be able to create, view, and edit governance policies through the rebuilt UI.
- **FR-007**: Users MUST be able to create, view, and edit governance objectives through the rebuilt UI.
- **FR-008**: Users MUST be able to create, view, and edit workflows through the rebuilt UI.
- **FR-009**: Users MUST be able to create, view, and edit teams through the rebuilt UI.
- **FR-010**: Users MUST be able to create, view, and edit projects through the rebuilt UI.
- **FR-011**: Every authenticated route contributed by a bounded context MUST redirect unauthenticated users to login before protected content is returned.
- **FR-012**: Every authenticated route contributed by a bounded context MUST render inside the shared shell for a valid active user and MUST show the correct product-section active navigation state.
- **FR-013**: The rebuilt UI MUST complete the smoke flow team -> project -> policy -> prompt -> prompt expansion entirely through user-facing pages.
- **FR-014**: The prompt expansion result in the smoke flow MUST show which governance policy was applied to the result.
- **FR-015**: Any discovered page or workflow gap MUST be recorded against the owning bounded-context feature rather than implemented directly as part of this integration checkpoint, unless the only needed work is composition wiring into the shared shell.
- **FR-016**: Any UI page that still relies on mock or seeded-only data for a core workflow MUST be treated as incomplete for this checkpoint until it uses the real REST-backed product behavior.
- **FR-017**: The final verification evidence MUST include the routes/workflows exercised, the result of each protected-route check, and the outcome of the end-to-end smoke flow.

### Key Entities

- **Composed App Route**: A user-facing route inside the authenticated product that renders within the shared app shell and belongs to one bounded-context feature.
- **Legacy Route Family**: A route or group of routes from the legacy frontend that represents a user outcome the rebuilt UI must preserve, replace, or explicitly retire.
- **Parity Finding**: A recorded audit result for one legacy route family or core workflow: rebuilt, replaced, removed, or missing, with owner and evidence.
- **Smoke Test Run**: A manual end-to-end verification session covering the cross-context creation and prompt-expansion workflow.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of bounded-context UI pages identified as already built by their owning epics are reachable through the shared authenticated app shell.
- **SC-002**: 0 active bounded-context pages retain a standalone shell, duplicate navigation, duplicate account footer, or temporary auth/middleware stand-in.
- **SC-003**: 100% of legacy frontend route families have a documented parity classification and, when not rebuilt directly, a documented replacement, removal rationale, or owning-feature gap.
- **SC-004**: A reviewer can complete the team -> project -> policy -> prompt -> prompt expansion smoke flow through the UI without direct API/database access.
- **SC-005**: 100% of unauthenticated requests to authenticated route families redirect to login before protected content renders.
- **SC-006**: The smoke-flow prompt expansion visibly reports the applied governance policy in the result or applied-policy summary.

## Assumptions

- This feature is a final composition and verification checkpoint, not the owner of building new bounded-context pages from scratch.
- The shared app shell/navigation feature, REST API core routes, and each bounded context's own page work are expected to exist before this feature begins.
- If a page nobody built is discovered, the correct output is a tracked ownership gap for that bounded context, not hidden implementation inside this checkpoint.
- "Legacy parity" is based on user outcomes and route families from the legacy frontend, not a requirement that every old URL remain identical.
- The manual smoke flow uses a user and organization with whatever permissions are required to create teams, projects, policies, prompts, and prompt expansions.
- Health/API support routes are included in the parity audit as support-surface checks, but they are not required to render inside the authenticated app shell unless they are user-facing app pages.
