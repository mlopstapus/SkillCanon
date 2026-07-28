# Feature Specification: Account & Team Settings UI

**Feature Branch**: `019-account-team-settings-ui`

**Created**: 2026-07-27

**Status**: Draft

**Input**: User description: "backlog/002-identity-access/010-account-and-team-settings-ui.md — pull the design directly from the `claude_design` MCP server (SkillCanon Settings.dc.html, project 7babdbf3-c063-46b5-84df-ffa9f588d88a) and implement it: the real, finished org/team management and API-key settings pages, plus the top-level teams hierarchy view."

## Clarifications

### Session 2026-07-27

- Q: `users.team_id` is `NOT NULL` in the current schema today, with no "no team" state and no reassignment UI anywhere in the codebase or mockup — so the previously-decided "orphan a removed member" behavior isn't representable as-is. What should this feature do about it? → A: Keep the orphan model in full — this feature owns migrating `team_id` to nullable and building a minimal admin UI to reassign an orphaned user to a team.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse the team hierarchy (Priority: P1)

Any signed-in user opens the Teams area and sees their organization's full team hierarchy as a navigable, indented tree. Selecting any team shows its details: name, slug, description, owner, parent team, the full breadcrumb path from the root team down to the selected team, and when it was created.

**Why this priority**: Every other capability in this feature (editing a team, viewing its members, issuing a key scoped to work someone does within a team) depends on first being able to find and open the right team. Without a legible hierarchy, governance and ownership become impossible to reason about — this is the foundation the rest of the feature sits on.

**Independent Test**: Can be fully tested by opening the Teams page as any user, confirming every team in the org appears in the tree at the correct depth, and confirming that selecting a deeply-nested team shows an unambiguous root-to-team breadcrumb.

**Acceptance Scenarios**:

1. **Given** an organization with a multi-level team hierarchy, **When** a user opens the Teams page, **Then** every team appears in the tree, correctly indented under its parent, with its current member count.
2. **Given** a team several levels deep in the hierarchy, **When** a user selects it, **Then** the detail panel shows its full root-to-team breadcrumb path, not just its immediate parent.
3. **Given** the team list, **When** a user types into the filter field, **Then** the tree narrows to matching teams by name.

---

### User Story 2 - Manage team structure (Priority: P1)

An organization admin creates new teams, edits an existing team's details, reorganizes the hierarchy by changing a team's parent, splits responsibilities by creating a sub-team, or inserts a new team between an existing team and its current parent.

**Why this priority**: Team structure is the backbone that governance policies and ownership cascade through (per this bounded context's existing team-hierarchy behavior); an admin must be able to shape it through the UI rather than needing direct database or API access, or this feature does not deliver its stated purpose.

**Independent Test**: Can be fully tested by an admin creating a new team, editing it, reparenting it under a different team, creating a sub-team beneath it, and inserting a new team between it and its parent — verifying the hierarchy reflects every change immediately and no step requires anything outside this UI.

**Acceptance Scenarios**:

1. **Given** the Teams page, **When** an admin creates a new team with a name, slug, description, and owner, **Then** the team appears in the hierarchy immediately.
2. **Given** an existing team, **When** an admin edits its name, slug, description, owner, or parent team, **Then** the changes are saved and reflected in the tree and breadcrumb.
3. **Given** a selected team, **When** an admin creates a sub-team beneath it, **Then** the new team appears nested under the selected team.
4. **Given** a selected team with an existing parent, **When** an admin inserts a new team "above" it, **Then** the new team becomes the selected team's parent, and the selected team's former parent becomes the new team's parent.
5. **Given** an attempted reparent that would create a cycle or move a team across organizations, **When** the admin submits the change, **Then** the system rejects it with a clear explanation and no partial change is applied.
6. **Given** a non-admin user, **When** they view a team, **Then** they do not see controls to create, edit, insert, or reparent teams.

---

### User Story 3 - Manage team membership (Priority: P2)

An organization admin or a team's owner invites a new member into that team by email, and removes a member who should no longer have access through that team.

**Why this priority**: Team membership is core to "manage a team," directly named in this feature's acceptance criteria — but it depends on User Story 1 (finding the team) and is one layer less foundational than the structural changes in User Story 2.

**Independent Test**: Can be fully tested by an authorized user inviting a member to a specific team, confirming the invitation is created, then removing an existing member, confirming they no longer appear as part of that team but do appear in an unassigned-users view, and reassigning them into a different team from there.

**Acceptance Scenarios**:

1. **Given** a selected team, **When** an org admin or that team's owner invites a member by email, **Then** an invitation is created for that team and role.
2. **Given** a selected team's member list, **When** an org admin or that team's owner removes a member, **Then** that member is immediately removed from the team, becomes an unassigned ("orphaned") user with no working team, and can no longer authenticate with any API key they had issued — but they remain visible in the product (outside the team tree) as an unassigned user pending reassignment to a team.
3. **Given** a user who is neither an org admin nor the selected team's owner, **When** they view that team's Members tab, **Then** they do not see invite or remove controls.
4. **Given** an email that already has a pending invitation to the same team, **When** a user tries to invite that email again, **Then** the system explains the invitation is already pending rather than silently creating a duplicate.
5. **Given** an unassigned (orphaned) user, **When** an org admin assigns them to a team, **Then** they immediately appear in that team's member list, disappear from the unassigned-users view, and regain the ability to authenticate with any API key they still hold.

---

### User Story 4 - Manage personal API keys (Priority: P2)

A signed-in user issues a new scoped API key for MCP/REST access outside the browser, sees the raw key exactly once at creation time, and can view and revoke their own keys at any time.

**Why this priority**: API keys are the second named "core workflow" in this feature's acceptance criteria and are independent of the team-hierarchy work — a user with zero team-management permissions can still fully use this story.

**Independent Test**: Can be fully tested by a user issuing a key, confirming the raw value is shown once and copyable, confirming it disappears from view after closing that dialog, and confirming an active key can be revoked and is then shown as revoked rather than removed from the list.

**Acceptance Scenarios**:

1. **Given** the API Keys page, **When** a user issues a new key with a name, one or more scopes, and an optional expiration, **Then** the raw key is displayed exactly once with a clear warning it cannot be shown again, and a way to copy it.
2. **Given** a member (non-admin) issuing a key, **When** they view the scope selector, **Then** only read-level scopes are selectable; write/run-level scopes are visibly present but disabled with an explanation.
3. **Given** an existing active key, **When** its owner revokes it, **Then** it is immediately marked revoked, remains visible in the list, and its "Revoke" control disappears.
4. **Given** the API Keys list, **When** a user views it, **Then** each key shows its name, prefix, granted scopes, creation date, last-used date, and status — never the raw key value.

---

### Edge Cases

- What happens when an unauthorized user attempts a team-management or membership action they cannot see a control for (e.g. by resubmitting a previous request)? The system must reject it server-side with a clear, non-generic explanation — hiding a control in the UI is a convenience, not the enforcement mechanism.
- What happens when a team's name/slug collides with another team already in the organization? The system rejects the create/edit with a specific "that slug is already in use" explanation, not a raw or generic failure.
- What happens when a team has no sub-teams? The Sub-teams tab shows an empty state explaining that sub-teams inherit the parent's policies, with a direct call-to-action to create one.
- What happens when a removed team member is the team's designated owner? Removal proceeds per User Story 3's Scenario 2 (they become unassigned); the team is left temporarily without an owner and its owner field must be reassigned by an admin before further edits that require an owner.
- What happens if a user attempts to issue an API key with no scopes selected? The system rejects the request and explains at least one scope is required.
- What happens when a key's expiration passes? It behaves like a revoked key for authentication purposes and its status reflects that (handled by existing key-authentication behavior; this feature only needs to display it correctly).
- What happens when a user with no admin rights and no team ownership opens the Teams page? They can still browse the full hierarchy and view every team's details/members — browsing is unrestricted; only mutating actions are gated.
- What happens when a non-admin user is themselves unassigned (has no team)? They remain able to sign in, but see no team hierarchy content to act on until an admin reassigns them; this feature only needs the admin-facing reassignment screen, not a special signed-in-but-unassigned experience beyond that.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to view their organization's complete team hierarchy as a navigable tree, with each team's name and current member count visible.
- **FR-002**: Users MUST be able to filter the team tree by name.
- **FR-003**: Users MUST be able to select any team and view its details: name, slug, description, owner, parent team, full root-to-team breadcrumb path, and creation date.
- **FR-004**: Only organization admins MUST be able to create a new team (name, slug, description, owner).
- **FR-005**: Only organization admins MUST be able to edit an existing team's name, slug, description, owner, and parent team.
- **FR-006**: Only organization admins MUST be able to create a sub-team directly beneath a selected team.
- **FR-007**: Only organization admins MUST be able to insert a new team between a selected team and its current parent, with the selected team automatically reparented beneath the new team.
- **FR-008**: The system MUST reject, with a clear explanation, any team edit/reparent/insert that would create a cycle in the hierarchy or move a team into a different organization.
- **FR-009**: Users MUST be able to view a selected team's sub-teams, including an empty state with a create-sub-team call-to-action when none exist.
- **FR-010**: Users MUST be able to view a selected team's members, including each member's name, email, and role.
- **FR-011**: Only an organization admin or the selected team's owner MUST be able to invite a new member to that team by email and role.
- **FR-012**: The system MUST prevent duplicate pending invitations to the same email for the same team, surfacing a clear explanation instead.
- **FR-013**: Only an organization admin or the selected team's owner MUST be able to remove a member from that team; removal immediately unassigns the member from every team, invalidates their ability to authenticate with any API key they hold, and leaves their account visible (outside the team tree) as unassigned, pending reassignment to a team by an admin.
- **FR-014**: The system MUST support a user having no team at all (unassigned/orphaned state), and only organization admins MUST be able to view the list of currently-unassigned users and assign one of them to a team.
- **FR-015**: Assigning an unassigned user to a team MUST immediately restore their ability to authenticate with any API key they still hold.
- **FR-016**: The system MUST reject unauthorized team-management or membership-management attempts server-side, regardless of what the requesting UI shows.
- **FR-017**: Users MUST be able to view their own issued API keys, showing name, key prefix, granted scopes, creation date, last-used date, and status (active/revoked/expired).
- **FR-018**: Users MUST be able to issue a new API key by providing a name, one or more scopes, and an optional expiration.
- **FR-019**: Members (non-admins) MUST be restricted to requesting only read-level scopes when issuing a key; write/run-level scopes MUST remain visible but disabled, with an explanation that they require admin access.
- **FR-020**: The system MUST require at least one scope to issue a key.
- **FR-021**: The system MUST display a newly issued key's raw value exactly once, with an explicit warning it cannot be retrieved again, and a one-click way to copy it before dismissing.
- **FR-022**: Users MUST be able to revoke any of their own active API keys; a revoked key MUST remain visible in the list (marked revoked) rather than disappearing.
- **FR-023**: The Teams and API Keys pages MUST be reachable from the shared application navigation, consistent with the rest of the authenticated product.

### Key Entities

- **Team**: A node in the organization's hierarchy — name, slug, description, owner, parent team (nullable at the root), member list, creation date. Cascades governance policy to its sub-teams and members.
- **Team Member**: A user's association with exactly one team at a time, carrying a role (admin/member) within the organization.
- **Unassigned (orphaned) User**: A user who has been removed from their team and currently has no team — a genuinely team-less state, not merely hidden — shown separately from the team tree in an admin-only view, whose API keys cannot authenticate until an admin reassigns them to a team.
- **Invitation**: A pending offer for a specific email to join a specific team at a specific role, with a state (pending/accepted/expired/revoked).
- **API Key**: A scoped, named credential belonging to one user — prefix, granted scopes, creation/last-used/expiration dates, and status; its raw value exists only transiently at creation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can locate any team in the hierarchy, regardless of nesting depth, and see its full ownership/parentage context within 15 seconds of opening the Teams page.
- **SC-002**: An admin can create a sub-team and see it appear correctly nested in the hierarchy in under 30 seconds, with zero steps performed outside this UI.
- **SC-003**: 100% of unauthorized team-management or membership actions are blocked with a clear, specific explanation rather than a silent failure or generic error.
- **SC-004**: A user can issue a new API key and view/copy its raw value in 3 or fewer interactions after opening the issue-key form.
- **SC-005**: A user can distinguish an active key from a revoked one at a glance, without needing to open or click into the key.
- **SC-006**: An admin can reorganize part of the hierarchy (reparent or insert a team) and immediately see the corrected structure reflected in the tree, with no page reload required to observe correctness.

## Assumptions

- The pulled design ("SkillCanon Settings.dc.html", claude.ai/design project `7babdbf3-c063-46b5-84df-ffa9f588d88a`) is the authoritative visual and interaction reference for this feature, per the originating backlog item's acceptance criteria that the shipped pages visually match whatever mockup is pulled in.
- The organization has exactly two roles today — admin and member — matching the existing role model; this feature does not introduce new roles or a per-resource permission matrix.
- Team creation, editing, reparenting, and insertion currently have no authorization check in the underlying application layer (verified against the code, not just documentation); this feature is responsible for adding admin-only enforcement at whatever layer connects this UI to those operations, applied consistently regardless of entry point.
- Invite/remove-member follow the authorization rule already enforced by the existing invitation functions: organization admin or the target team's own owner.
- "Removing a member from a team" unassigns them entirely at removal time (no destination-team picker in that moment) rather than reassigning them elsewhere; the previously-issued invitations/keys model already distinguishes active from inactive users, and this feature extends that distinction to a genuinely team-less "unassigned" state rather than deactivating the account outright. Representing that state requires this feature to migrate the user's team association from required to optional at the data level — a real, in-scope schema change, not just a UI-layer concern — plus a minimal admin-only screen listing unassigned users and letting an admin assign one to a team.
- The API Keys page shows only the signed-in user's own keys in this pass; an admin browsing another user's keys (a capability the underlying functions already support) is out of scope here.
- Team deletion and changing a member's role from this UI are not part of this feature — neither affordance exists in the design mockup.
- The scopes offered when issuing an API key are the fixed, currently-meaningful set (prompt read/write, workflow run); expanding this set as future bounded contexts ship their own resources is out of scope here.
- Mobile/responsive layout follows the same collapsing behavior already established elsewhere in the authenticated app shell; no separate mobile-specific design was provided for these pages.
- The admin-only unassigned-users view (FR-014) surfaces as an entry alongside the team tree on the existing Teams page rather than a wholly separate route, keeping unassigned-user management one click from where every other team-membership action already lives.
