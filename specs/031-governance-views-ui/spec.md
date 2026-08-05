# Feature Specification: Governance Views UI

**Feature Branch**: `031-governance-views-ui`

**Created**: 2026-08-05

**Status**: Clarified

## Clarifications

### Session 2026-08-05

- Q: The real `enforcementType` column supports four values (prepend, append, inject, validate), but the mockup's New Policy drawer only offers three. Should the real authoring UI offer all four, or deliberately keep the mockup's three? → A: Offer all four — add a `validate` option to the enforcement picker so the UI can author every policy shape the domain model supports.

**Input**: User description: "`backlog/005-governance/005-governance-views-ui.md` — built directly against the real SkillCanon Governance.dc.html mockup (claude.ai/design project 7babdbf3-c063-46b5-84df-ffa9f588d88a). Mockup: a scope-tree sidebar (filterable, hierarchical team/user rows, each with a local policy+objective count badge) next to a main panel showing effective governance for the selected scope — Policies/Objectives tabs, each split into an Inherited section (immutable, walked up the ancestor chain) and a Local section (editable at the selected scope). A 'New policy/objective' action opens a drawer to author a name, enforcement mode (policies only), priority (policies only), and content, with edit/delete on existing local items. Two real gaps found against the actual domain model: (1) `policies.teamId` is NOT NULL in the real schema — a policy can only ever be authored at a team, never an individual user, but the mockup's scope tree lets you select individual users too; objectives allow team/project/user scope, so objective authoring has no such restriction; (2) the real `enforcementType` enum has four values (prepend, append, inject, validate) but the mockup's picker only offers three. Route scaffolding already exists and dictates the URL shape: `/teams/[teamId]/policies` and `/teams/[teamId]/objectives`, already wired into the app nav. Backing API is fully built: `resolveEffectivePolicies`, `resolveAllPolicies`, `createPolicy`/`updatePolicy`/`deletePolicy`, `createObjective`/`updateObjective`/`deleteObjective` all exist and are org-scoped. This feature builds the UI/route layer only, composed into the existing app shell."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See effective governance for a team or person (Priority: P1)

As an organization admin or team lead, I need to see every policy and objective that actually applies to a given team or person — both the ones inherited from parent teams and the ones defined locally — so I understand exactly what governs prompt behavior for that scope without having to mentally trace the team hierarchy myself.

**Why this priority**: This is the entire reason the page exists — governance that can't be seen isn't governance anyone can reason about. Every other capability on this page (authoring, editing) is secondary to first being able to see the effective, resolved picture.

**Independent Test**: Can be fully tested by navigating to a team's Policies (or Objectives) page and confirming both inherited and local items render correctly, with inherited items visibly distinct and clearly attributed to their source team.

**Acceptance Scenarios**:

1. **Given** a team with policies defined on itself and on an ancestor team, **When** viewing that team's Policies page, **Then** the ancestor's policies appear in an "Inherited" group (each showing which team it comes from) and the team's own policies appear in a separate "Local" group.
2. **Given** a team with no locally-defined policies, **When** viewing its Policies page, **Then** an empty state explains that the team inherits everything shown above and offers a way to add a local policy.
3. **Given** a person (not a team) is the selected scope, **When** viewing their Policies or Objectives page, **Then** the same inherited/local split is shown, resolved through their own team chain.
4. **Given** a scope with both policies and objectives, **When** switching between the Policies and Objectives tabs, **Then** each tab's own item count is visible before switching, and the correct set loads for each.

---

### User Story 2 - Author and remove a local policy or objective (Priority: P1)

As a team lead, I need to add a new policy or objective at my team's scope, and remove one I no longer want, so I can actually govern my team's prompt behavior rather than only observe what's already there.

**Why this priority**: Viewing without authoring is read-only reporting, not governance management — this is what makes the page a real tool rather than a dashboard.

**Independent Test**: Can be fully tested by creating a new local policy (or objective) at a team scope, confirming it appears immediately in the Local section, then deleting it and confirming it's gone.

**Acceptance Scenarios**:

1. **Given** a team is the selected scope, **When** an admin/team-lead creates a new policy with a name, enforcement mode, priority, and content, **Then** the policy appears in that team's Local policies immediately and is visible as inherited on every descendant team/person's page.
2. **Given** a person (not a team) is the selected scope, **When** the "new policy" action is available, **Then** it is not offered, or is clearly disabled with an explanation — policies can only be authored at a team, never for an individual person.
3. **Given** a team or person is the selected scope, **When** an admin/team-lead creates a new objective, **Then** it succeeds regardless of whether the scope is a team or a person.
4. **Given** an existing local policy or objective, **When** an authorized user deletes it, **Then** it no longer appears in that scope's Local section or in any descendant's Inherited section.
5. **Given** an existing local policy or objective, **When** an authorized user edits its content (and, for a policy, its enforcement mode or priority), **Then** the updated values are reflected in that scope's own view and in every descendant's inherited view.
6. **Given** a user without administrative authority over the selected scope, **When** they view the page, **Then** creation/deletion/editing actions are not available to them.

---

### User Story 3 - Navigate the org's scope hierarchy while governing (Priority: P2)

As an admin managing governance across a whole organization, I need to move between teams and people in the hierarchy quickly, and see at a glance which ones already have local rules defined, so I can audit governance coverage without opening every scope one at a time.

**Why this priority**: Valuable for real day-to-day use once the core viewing/authoring loop works, but the page is still useful scope-by-scope without it.

**Independent Test**: Can be fully tested by filtering the scope list to a search term, confirming matching teams/people are shown, selecting one, and confirming the main panel updates to that scope without a full page reload.

**Acceptance Scenarios**:

1. **Given** the organization's team/person hierarchy, **When** viewing the scope list, **Then** every team and person is shown indented to reflect its depth in the hierarchy.
2. **Given** a scope has one or more local policies or objectives, **When** viewing the scope list, **Then** a count badge indicates how many local items exist at that scope; a scope with none shows no badge.
3. **Given** a filter term is entered, **When** it matches a subset of teams/people, **Then** only matching entries (and enough hierarchy context to place them) remain visible.
4. **Given** a different scope is selected from the list, **When** the selection changes, **Then** the main panel's breadcrumb, tabs, and content update to the newly selected scope without navigating away from the page.

### Edge Cases

- What happens when a scope has zero policies or objectives at every level, including every ancestor? Both Inherited and Local sections show their respective empty states — no error, no misleading "loading" state.
- What happens when a local policy's enforcement mode is one the current authoring UI doesn't expose as a create option, because it was created another way? It still displays correctly in the Inherited/Local lists — display must not assume only the UI-offered subset of modes ever exists on a real row (see FR-011 and Assumptions on the four-value enum).
- What happens when someone without authority over a scope tries to reach a create/edit/delete action directly (not through the UI)? The action is rejected the same way the underlying write operation already rejects an unauthorized caller — the UI must not be the only enforcement point.
- What happens when the selected scope no longer exists (e.g., the team was deleted in another tab)? The page shows a clear "no longer available" state rather than a blank or broken panel, and offers a way back to a valid scope.
- What happens when a person is selected as scope and the Policies tab is active? The "new policy" action is unavailable for that scope (see User Story 2, Scenario 2); the Objectives tab has no such restriction.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display, for any selected team or person scope, the full set of policies that effectively apply to that scope — every policy inherited from an ancestor team plus every policy defined locally at that scope.
- **FR-002**: System MUST display, for any selected team or person scope, the full set of objectives that effectively apply to that scope — every objective inherited from an ancestor team plus every objective defined locally at that scope.
- **FR-003**: System MUST visually distinguish inherited items from local items, and MUST show which ancestor scope each inherited item comes from.
- **FR-004**: System MUST allow an authorized user to create a new local policy at a **team** scope only, capturing at minimum a name, an enforcement mode (offering all four real values: prepend, append, inject, validate), a priority, and content.
- **FR-005**: System MUST NOT allow policy creation when the currently selected scope is a person rather than a team, and MUST make this restriction clear to the user rather than silently failing.
- **FR-006**: System MUST allow an authorized user to create a new local objective at either a team scope or a person scope, capturing at minimum a name and content.
- **FR-007**: System MUST allow an authorized user to delete an existing local policy or objective, and the deletion MUST be reflected immediately in that scope's own view and in every descendant scope's inherited view.
- **FR-007a**: System MUST allow an authorized user to edit an existing local policy or objective's content (and, for a policy, its enforcement mode and priority), with the update reflected immediately in that scope's own view and in every descendant scope's inherited view. Editing is scoped to the same team-only-for-policies restriction as creation (FR-005).
- **FR-008**: System MUST restrict create/delete/edit actions to users with administrative authority over the affected scope, both in what the UI offers and in what any underlying request actually permits.
- **FR-009**: System MUST present a navigable list of every team and person in the organization's hierarchy, indented to reflect depth, with the currently selected scope clearly indicated.
- **FR-010**: System MUST show a count of locally-defined policies plus objectives next to each scope in the hierarchy list where that count is greater than zero.
- **FR-011**: System MUST correctly display a policy whose enforcement mode is any value the system supports, not only the values offered when creating a new policy through this UI.
- **FR-012**: System MUST allow filtering the hierarchy list by a search term, showing only matching teams/people (with enough surrounding hierarchy context to understand where a match sits).
- **FR-013**: System MUST let a user switch between viewing policies and viewing objectives for the same selected scope without leaving the page.
- **FR-014**: System MUST let a user change the selected scope without a full page navigation, updating the displayed policies/objectives, breadcrumb, and counts to match.
- **FR-015**: System MUST show a clear empty state, distinct from a loading state or an error, when a scope has no locally-defined policies (or objectives), explaining that the scope inherits everything shown above and offering a way to add one (subject to FR-005 for policies).

### Key Entities

- **Policy**: An organization-scoped governance rule, always owned by exactly one team (never an individual person), with a name, an enforcement mode, a priority (determines ordering when multiple policies apply), and content. Applies to the owning team and every descendant team/person in the hierarchy.
- **Objective**: An organization-scoped governance goal, owned by a team, a project, or an individual person, with a name and content. Applies to its owner and, when team- or project-owned, every descendant in that hierarchy.
- **Scope**: A node in the organization's team/person hierarchy — either a team or an individual person — used to view or author policies/objectives. A scope's "effective" governance is the union of everything inherited from its ancestor chain plus whatever is defined locally on it.
- **Hierarchy list entry**: One row in the scope-navigation list — a team or person, its depth in the hierarchy, and a count of locally-defined policies+objectives at that node.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can determine every policy and objective that applies to any team or person in their organization within a single page view, with no need to manually check ancestor teams one at a time.
- **SC-002**: A new local policy or objective, once created, is visible in its scope's Local section and in every descendant scope's Inherited section without requiring a page reload or a delay.
- **SC-003**: Switching between scopes, and between the Policies and Objectives tabs, completes without a full page navigation in under 1 second under normal conditions.
- **SC-004**: 100% of policy-creation attempts at a person scope are prevented or clearly explained, never silently accepted or silently dropped.
- **SC-005**: A user without administrative authority over a scope cannot create or delete policies/objectives there, verified independent of whether the UI happens to hide the controls.

## Assumptions

- Team hierarchy and person-to-team membership are resolved through Identity & Access's existing contract (team tree, user-team relationships) — this feature does not define or change that hierarchy, only reads it to build the scope list.
- "Administrative authority over a scope" reuses whatever authorization the underlying `createPolicy`/`deletePolicy`/`createObjective`/`deleteObjective` operations already enforce (org-admin-or-team-relevant-authority) — this feature does not define a new authorization model, only surfaces the existing one and must not bypass it client-side.
- Route paths are fixed by already-existing navigation wiring: `/teams/[teamId]/policies` and `/teams/[teamId]/objectives`. A person-scoped view is reached by changing the selected scope within the page, not a separate top-level route per person.
- No new entitlement gate is needed — this page lives inside the existing `(app)` route group, already gated once at the shell level by `coreFeaturesEnabled` (default-enabled for both tiers).
