# Feature Specification: GitHub App Registration & Installation

**Feature Branch**: `feat/011-001-github-app`

**Created**: 2026-10-30

**Status**: Draft

**Input**: User description: "GitHub App registration and installation for the vcs-integration bounded context (backlog/011-vcs-integration/001), config-driven, inert when unconfigured, soft-delete on uninstall."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin connects SkillCanon to a GitHub account (Priority: P1)

An organization admin opens the GitHub integration settings, sees that SkillCanon can be installed on GitHub, follows the install link, approves it on GitHub, and returns to SkillCanon where the new connection is listed with its GitHub account name and type.

**Why this priority**: Without a recorded installation nothing else in the epic can talk to GitHub.

**Independent Test**: With the App configured, complete the install redirect and callback; exactly one installation appears for the org with the right account login and type.

**Acceptance Scenarios**:

1. **Given** the GitHub App is configured and the user is an org admin, **When** they choose "Install SkillCanon on GitHub", **Then** they are sent to GitHub's installation page carrying a tamper-proof marker of their organization.
2. **Given** GitHub returns the user after installing, **When** the callback is received with a valid marker, **Then** one installation is recorded for that organization with the GitHub installation id, account login and account type, and an audit event is written.
3. **Given** the callback carries a missing, expired or altered marker, **When** it is received, **Then** nothing is recorded and the user sees a clear error.
4. **Given** the GitHub App is not configured, **When** an admin opens the integration settings, **Then** they see a "not configured" explanation and no install action.

---

### User Story 2 - GitHub keeps SkillCanon's view of the installation current (Priority: P1)

When someone suspends, unsuspends, or removes the installation on GitHub, SkillCanon learns of it from GitHub's notification and reflects it, without anyone editing SkillCanon.

**Why this priority**: A stale installation would make later evaluation act on a connection GitHub no longer honors.

**Independent Test**: Deliver signed `installation` notifications (created, suspend, unsuspend, deleted) and check the stored installation after each.

**Acceptance Scenarios**:

1. **Given** a recorded installation, **When** a signed `suspend` notification arrives, **Then** it is marked suspended with the time; **When** `unsuspend` arrives, **Then** the mark is cleared.
2. **Given** a recorded installation, **When** a signed `deleted` notification arrives, **Then** the installation is marked deleted (kept for history), no longer listed as active, and any repo links or PR check history referring to it remain readable.
3. **Given** a notification with a missing or wrong signature, **When** it is received, **Then** it is rejected and changes nothing.
4. **Given** the same delivery id arrives twice, **When** processed, **Then** it takes effect once.
5. **Given** a `pull_request` notification, **When** received before PR evaluation exists, **Then** it is acknowledged and ignored.

---

### User Story 3 - Secure, on-demand GitHub access (Priority: P2)

Later features need to call GitHub on an installation's behalf. SkillCanon obtains a short-lived access token from the App's private key only when needed, uses it for that request, and never stores or logs it.

**Why this priority**: Required by features 002 and 005, but invisible to users on its own.

**Independent Test**: Request a token for an installation with a stubbed GitHub; confirm it is returned for use, absent from storage and logs, and that the private key never appears in logs either.

**Acceptance Scenarios**:

1. **Given** a configured App and an active installation, **When** an installation token is needed, **Then** one is obtained fresh from GitHub and not persisted.
2. **Given** a suspended or deleted installation, **When** a token is requested, **Then** the request is refused without calling GitHub.
3. **Given** any success or failure path, **When** logs are inspected, **Then** neither the private key nor any token appears.

---

### User Story 4 - Admin lists connections (Priority: P3)

An admin (and later UI) can list the organization's installations, active and suspended, to see what is connected.

**Independent Test**: Create installations in two organizations; each org lists only its own.

**Acceptance Scenarios**:

1. **Given** installations in two orgs, **When** org A lists, **Then** only A's active installations appear.

### Edge Cases

- Installation notification for an installation id SkillCanon never recorded (e.g., created while unconfigured): acknowledged, no error, nothing created without an org marker.
- Callback replayed for an installation already recorded: no duplicate row.
- Webhook secret not configured: every webhook is rejected.
- Callback for a different GitHub account than expected cannot be detected; the installation id is verified against GitHub before recording.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST read the GitHub App id, slug, private key and webhook secret from environment configuration only; none is stored in the database or repository.
- **FR-002**: When any required GitHub App setting is missing, the integration MUST be inert: the settings page says so, install and webhook endpoints refuse, and nothing else in the product is affected.
- **FR-003**: Org admins MUST be able to start an install that redirects to GitHub carrying a signed, expiring marker identifying their organization and user.
- **FR-004**: The install callback MUST verify the marker, confirm the installation with GitHub, and record one installation (GitHub installation id, account login, account type) for that organization; replays MUST NOT duplicate.
- **FR-005**: The system MUST expose a webhook endpoint that verifies GitHub's signature over the raw body, deduplicates by delivery id, and dispatches by event type; invalid signatures MUST be rejected with no side effects.
- **FR-006**: `installation` events `created`, `suspend`, `unsuspend` and `deleted` MUST update the stored installation (suspended time set/cleared; deleted marks it deleted rather than removing it).
- **FR-007**: A deleted installation MUST NOT be returned as active, MUST NOT yield tokens, and MUST leave dependent repo links and PR check history readable.
- **FR-008**: `pull_request` events MUST be acknowledged and ignored until PR evaluation is built; other events are acknowledged and ignored.
- **FR-009**: Installation access tokens MUST be minted on demand from the private key and MUST NOT be persisted; neither tokens nor the private key may appear in logs or error messages.
- **FR-010**: `listInstallations(orgId)` MUST return only that organization's non-deleted installations.
- **FR-011**: Installation created, suspended and deleted MUST each write an audit event; unsuspend is recorded as an audit event as well.
- **FR-012**: Every stored row MUST be scoped to an organization and protected by row-level security consistent with other contexts, with the webhook path resolving the organization from the stored installation, never from request input.

### Key Entities

- **Installation**: a GitHub App installation tied to one organization: GitHub installation id, account login, account type, suspended time, deleted time.
- **Webhook delivery**: a record of delivery ids already processed, to make redelivery harmless.

## Success Criteria *(mandatory)*

- **SC-001**: An admin can connect a GitHub account in under two minutes from the settings page, ending with the connection listed.
- **SC-002**: A suspend, unsuspend or uninstall on GitHub is reflected in SkillCanon after a single delivery, with no manual action.
- **SC-003**: 100% of webhook requests with a bad or missing signature are rejected without changing any data.
- **SC-004**: Neither the private key nor any access token appears in any log output across success and failure paths in tests.
- **SC-005**: An organization can never list or see another organization's installations.

## Assumptions

- Registering the GitHub App itself (permissions `checks:write`, `pull_requests:read`, `contents:read`, `metadata:read`; events `installation`, `installation_repositories`, `pull_request`; a publicly reachable webhook URL) is a one-time manual step by the maintainer, documented in the README. The App is owned by a personal GitHub account (decision 2026-10-30), installable on that account and its repos ("Only on this account"; "Any account" optional), with no organization-level permissions; ownership can move to an org later and nothing hard-codes the owner. Acceptance criteria needing a real App and a real GitHub org are "needs Ben".
- A self-hosted instance has one organization, but the design keys everything by organization regardless.
- Uninstall is a soft delete (decision: keeps PR history queryable under the codebase's hard foreign keys).
- Only SkillCanon organization admins can start an install.
