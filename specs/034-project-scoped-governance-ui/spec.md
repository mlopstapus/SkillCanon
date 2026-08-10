# Feature Specification: Project-Scoped Governance UI

**Feature Branch**: `034-project-scoped-governance-ui`

**Created**: 2026-08-09

**Status**: Draft

**Input**: User description: "backlog/005-governance/006-project-scoped-governance-ui.md, implemented against the Claude Design mockup `SkillCanon Skills.dc.html` (project 7babdbf3-c063-46b5-84df-ffa9f588d88a)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View a project's local objectives (Priority: P1)

An admin opens a project's detail page and views a "Governance" tab listing every objective defined locally for just this project.

**Why this priority**: Without visibility into what's already defined for a project, an admin cannot judge whether new project-specific guidance is needed — this is the foundation the authoring story depends on.

**Independent Test**: Open any project's detail page, click the Governance tab, and confirm the project's local objectives render — testable with zero objectives present (empty state) and with several present.

**Acceptance Scenarios**:

1. **Given** a project with one or more objectives created locally for it, **When** an admin opens the project's Governance tab, **Then** each appears with its name and guidance text.
2. **Given** a project with no local objectives, **When** an admin opens the Governance tab, **Then** an empty state explains the project has no objectives of its own yet, with a clear call to action to add one.

**Deliberately excluded (per 2026-08-09 clarification)**: this tab does not show a project's team-inherited objectives, and does not mention policy at all. Real governance resolution at skill-invocation time (`expand()`) already flows from the invoking user's own team context, independent of which project a skill happens to run in — this tab is a project-scoped *authoring surface* for local objectives only, not a preview of what a given invocation would actually resolve. See Assumptions for the full reasoning.

---

### User Story 2 - Author a local objective for a project (Priority: P1)

An admin creates a new objective scoped to just one project, edits its name or guidance text later, or removes it — without affecting any other project or the project's owning team.

**Why this priority**: Viewing (User Story 1) is only useful once an admin can actually act on what they see — authoring is the other half of the same capability and was this backlog item's other explicit acceptance criterion.

**Independent Test**: From a project's Governance tab, create an objective with a name and guidance text, confirm it appears immediately in "Local to this project," edit its text and confirm the change persists, then delete it and confirm it's gone — all without any other project or the project's team showing a change.

**Acceptance Scenarios**:

1. **Given** an admin viewing a project's Governance tab, **When** they open "New objective," fill in a name and guidance text, and submit, **Then** the objective is created scoped to that project only and appears under "Local to this project."
2. **Given** an existing local objective on a project, **When** an admin opens it for editing and changes its name or guidance text, **Then** the update is saved and reflected immediately.
3. **Given** an existing local objective on a project, **When** an admin removes it, **Then** it no longer appears on the project's Governance tab.
4. **Given** a non-admin project member, **When** they view the project's Governance tab and attempt to create, edit, or delete an objective, **Then** the request is rejected server-side with a clear error message (matching the existing team-scoped governance page's behavior — controls are not hidden client-side; no page in this app currently hides mutation controls by viewer role, and this feature does not introduce that as a new, one-off convention).

---

### Edge Cases

- A project with no local objectives: the tab's own count badge shows 0 and the empty state renders.
- Very long guidance text: the create/edit drawer's textarea already supports multi-line, resizable input (same drawer primitive as team/person-scoped objectives).
- A project is deleted while its Governance tab is open: out of scope for this feature — matches existing behavior for a project's other tabs (Members, Skills, Repositories) under the same failure mode, not a new concern this feature introduces.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The project detail page MUST have a "Governance" tab, alongside its existing Metrics, Members, Skills, Repositories, and Teams tabs, showing a count badge of the project's local objective count.
- **FR-002**: The Governance tab MUST display the project's local objectives only — no team-inherited objectives section and no policy content or explanation of any kind (2026-08-09 clarification: governance resolution at invocation time already follows the invoking user's own team context, independent of project; this tab is not a preview of that resolution).
- **FR-003**: An admin MUST be able to create a new objective scoped to exactly one project (name + guidance text), which does not cascade to any other project or to any team.
- **FR-004**: An admin MUST be able to edit an existing local project objective's name and guidance text.
- **FR-005**: An admin MUST be able to delete an existing local project objective.
- **FR-006**: A non-admin viewing a project's Governance tab MUST be able to see the project's local objectives and MAY see create/edit/delete controls, but any mutation attempt MUST be rejected server-side with a clear error message — matching the existing team/person-scope governance page, which does not hide these controls by viewer role either (2026-08-09 correction: an earlier draft of this requirement asked for client-side hiding, which no page in this app actually does; verified by reading `project-detail-view.tsx` and the team-scoped governance page's own components during `/speckit-analyze`).
- **FR-007**: Empty states (no local objectives) and loading/error states on this tab MUST use this app's shared `AppState`/empty-state conventions, not a one-off implementation.

### Key Entities *(include if feature involves data)*

- **Objective** (existing entity, `governance.objectives`): a piece of guidance text with a scope. This feature adds no new columns and no new resolution logic — `projectId` already exists on the table and is already supported end-to-end by `createObjective`/`updateObjective`/`deleteObjective`/`listActiveByProject`. This feature is purely the UI to view and author objectives at that existing scope.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An admin can see every objective defined specifically for a given project in a single view, without navigating away from the project.
- **SC-002**: An admin can create a project-scoped objective in under 30 seconds from the project's own page, with no need to visit a separate team-governance page.
- **SC-003**: Creating, editing, or deleting a local project objective never changes what appears on any other project's or team's governance view.
- **SC-004**: The feature introduces zero new automated-accessibility violations (matches this repo's existing zero-critical/serious axe gate) and reuses the shared `Drawer`/`AppState` primitives rather than introducing new one-off patterns.

## Assumptions

- **Ownership resolved by the mockup, overriding the backlog item's own tentative lean**: the backlog item's Requirements text suggested extending the team-scoped governance pages (`/teams/[teamId]/objectives`) was "the more consistent choice," but the actual design mockup (`SkillCanon Skills.dc.html`) places this entirely on the project detail page (`/projects/[id]`) as a new "Governance" tab, with no team-scope-tree involvement. This spec follows the mockup, not the backlog item's own guess — the backlog item explicitly flagged this as an open question for the implementer to resolve, not a settled decision.
- **No policy content anywhere on this tab, and no team-inherited objectives section either (2026-08-09 clarification, superseding both the backlog item and the mockup)**: the mockup depicted a two-section "Inherited from teams" + "Local to this project" layout with an explanatory policy banner. During spec review, direct inspection found no existing function correctly resolves a project's team-inherited objectives (the only `projectId`-aware function, `resolveEffectiveObjectives`, derives inheritance from an arbitrary *viewing user's* team chain, not the project's own team) — and separately, the user clarified their actual intent: governance (both policy and, by the same reasoning, the "what would apply" preview for objectives) is fundamentally resolved per-invoking-user at skill-run time via `expand()`, not per-project. A project-page preview of team-inherited objectives would imply a project has its own governance identity distinct from its members, which doesn't match how the system actually resolves anything. Decision: this tab is a pure authoring surface for local project objectives — no inherited-objectives display, no new resolution function, no policy mention at all. This eliminates the need for any new cross-BC resolution logic; the feature only needs `listActiveByProject`/`createObjective`/`updateObjective`/`deleteObjective`, all of which already exist.
- **Reuses the existing `ObjectiveDrawer` component** (`src/app/(app)/teams/[teamId]/objective-drawer.tsx`), extending its `scopeKind: "team" | "person"` union to include `"project"`, rather than building a new drawer — it already supports `mode: "create" | "edit"` and the shared `Drawer` accessibility primitive.
- **Local objective rows are clickable to edit**, even though the mockup's own row markup only shows a delete (×) button with no visible edit affordance — the mockup is treated as visually incomplete here, not as an intentional "no edit" decision, since the backlog item explicitly requires edit and the existing `ObjectiveDrawer` already supports it. Matches this app's established list-row convention (e.g. the Skills list, whose rows are themselves the click target).
- **Non-admin read access, admin-only authoring** follows the same authorization pattern already established on the team/person-scoped governance page — no new authorization concept is introduced.
