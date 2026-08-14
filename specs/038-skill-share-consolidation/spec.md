# Feature Specification: Skill share/project-drawer consolidation

**Feature Branch**: `038-skill-share-consolidation` (spec directory number; actual git branch is `039-consolidate-skill-share-project-drawer` — branch name and spec directory number intentionally differ per this repo's established convention, see `CLAUDE.md`)

**Created**: 2026-08-14

**Status**: Draft

**Input**: User description: "Consolidate the skill detail page's two overlapping sharing/project mechanisms into one. Full approved design is at docs/superpowers/specs/2026-08-14-skill-share-drawer-consolidation-design.md — use it as the authoritative source for scope and decisions (already interviewed and approved by the user; do not re-litigate the decisions in it). Summary: remove the \"Projects\" toolbar button and assign-projects-drawer.tsx (per-project required/optional assignment) entirely from the skill detail page (src/app/(app)/prompts/[name]/) — that capability already exists correctly on the project detail page's Skills tab (src/app/(app)/projects/[id]/project-detail-view.tsx) and becomes the sole place enforcement is set. The skill page's Share drawer (share-drawer.tsx) becomes the only sharing mechanism there, with updated banner copy matching the \"SkillCanon Skills\" Claude Design mockup, Grant/Revoke labels normalized across People/Teams/Projects, and a new \"X teams · Y subscribers · Z copies\" summary pill backed by a new countForksOfSkill read (prompts-repo.ts + application layer + CONTRACT.md entry) plus the already-fetched subscription count."

**Supersedes**: This spec formalizes the already-interviewed, already-approved design at `docs/superpowers/specs/2026-08-14-skill-share-drawer-consolidation-design.md`. That document is the authoritative source for every decision below — this spec restates it in Speckit's format for planning/task-generation purposes, not to re-open any decision.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One sharing control on a skill's page (Priority: P1)

An org member viewing a skill's detail page wants to share it with people, teams, or projects. Today they see two separate buttons ("Share" and "Projects") whose purposes overlap and aren't obviously distinct. After this change, they see exactly one control ("Share") that covers every grant they can make from this page.

**Why this priority**: This is the actual confusion reported — it's the core problem the whole feature exists to fix.

**Independent Test**: Open any skill's detail page. Confirm only one sharing-related toolbar button ("Share") appears, and that opening it shows people/teams/projects grant controls with no way to set a required/optional enforcement level.

**Acceptance Scenarios**:

1. **Given** a skill's detail page, **When** the page loads, **Then** the toolbar shows a single "Share" button and no "Projects" button.
2. **Given** the Share drawer is open, **When** the org member reviews its contents, **Then** they see People, Teams, and Projects sections with Grant/Revoke controls only — no required/optional/none control anywhere in the drawer.

---

### User Story 2 - Project enforcement stays on the project page (Priority: P1)

A project lead deciding whether a skill is required, optional, or not part of their project's curated set continues to do this from the project's own detail page, exactly as they do today — this workflow is unaffected by the consolidation.

**Why this priority**: This is the *other* half of "one mechanism per concern" — enforcement must keep working exactly as it does now, just without the now-removed duplicate entry point on the skill page.

**Independent Test**: From a project's detail page, open its Skills tab and set a skill to Required, then Optional, then remove it. Confirm each transition works exactly as before, with no change in behavior.

**Acceptance Scenarios**:

1. **Given** a project's Skills tab, **When** the project lead marks an available skill "Required", **Then** the skill moves into the Required group, exactly as before this change.
2. **Given** a skill already required or optional for a project, **When** the skill's own detail page is viewed, **Then** its read-only project-label badge still shows that project (this display is unaffected — only the *editing* surface on the skill page is removed).

---

### User Story 3 - See how widely a skill has spread (Priority: P2)

An org member looking at a shared skill wants a quick sense of its real reach: how many teams have access, how many individual subscribers exist across all grant types, and how many independent copies (forks) of it exist across the organization.

**Why this priority**: Valuable context for the share workflow, but secondary to the core consolidation — the feature is coherent without it, though it was requested as part of matching the approved design.

**Independent Test**: Open a skill that has at least one team grant and at least one fork. Confirm the summary pill on its detail page shows accurate team, subscriber, and copy counts, and that opening the Share drawer reflects the same underlying grants.

**Acceptance Scenarios**:

1. **Given** a skill with 2 granted teams, 3 total subscription grants (across people/teams/projects), and 1 fork elsewhere in the org, **When** its detail page loads, **Then** the summary pill reads "2 teams · 3 subscribers · 1 copy" (exact wording per the approved design).
2. **Given** a skill with no grants at all, **When** its detail page loads, **Then** no summary pill is shown (same visibility rule as today).

---

### Edge Cases

- What happens to a skill that already has a project-level required/optional assignment when this ships? Nothing — that data and its display (the read-only project-label badge) are unaffected; only the skill page's *editing* entry point for it is removed.
- What happens when a skill has been forked many times but has zero direct subscriptions? The summary pill still shows the team/subscriber counts (both potentially 0) alongside a nonzero copy count, since the three numbers are independent.
- What happens to the Team row's grant/revoke label wording? Normalized to "Grant"/"Revoke", matching People and Projects — not the mockup's inconsistent "Share"/"Revoke" for teams (explicit decision, see Assumptions).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST NOT offer any control on the skill detail page for setting or viewing an editable per-project required/optional assignment for that skill.
- **FR-002**: System MUST continue to support setting a skill's per-project requirement (required/optional/none) exclusively through the project detail page's existing skills management view, with no change in that view's behavior.
- **FR-003**: System MUST provide exactly one sharing/grant entry point on the skill detail page (the Share drawer), covering grants to people, teams, and projects.
- **FR-004**: Share drawer grant/revoke controls MUST use the same "Grant"/"Revoke" labeling across all three sections (People, Teams, Projects).
- **FR-005**: Share drawer MUST display introductory copy explaining that a grant lets recipients subscribe to live updates or make their own independently-editable copy, and that only the owner can edit the original.
- **FR-006**: System MUST display, on a skill with at least one team or project grant, a summary showing: the count of teams granted, the total count of subscription grants across all subscriber types (people, teams, and projects combined), and the count of other skills in the organization forked from this one.
- **FR-007**: The read-only display of which project(s) a skill is required/optional for (the project-label badge already shown on the skill detail page) MUST remain unchanged in both data and appearance.
- **FR-008**: The skill detail page's fork ("Make a copy"), Deprecate/Reactivate, and New Version actions MUST remain unaffected by this change.
- **FR-009**: System MUST NOT change the underlying authorization/eligibility rules for setting a project's required/optional skill assignment (e.g., which skills are eligible per project) — this feature only changes where the control is surfaced, never the rule itself.

### Key Entities

- **Subscription**: An existing grant of a skill's access to a person, team, or project (unchanged by this feature — only how its aggregate count is displayed changes).
- **Skill fork ("copy")**: An existing relationship where one skill records the skill it was copied from (unchanged by this feature — only that a count of these is now surfaced).
- **Project skill assignment**: An existing per-project required/optional/none marker on a skill (unchanged by this feature — only its skill-page editing entry point is removed; its project-page entry point and its read-only skill-page display both continue unchanged).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A person viewing any skill's detail page finds exactly one sharing-related control, with zero ambiguity about where to go to grant access vs. set project enforcement.
- **SC-002**: Setting a skill's required/optional status for a project continues to work with 100% behavioral parity to before this change, verified with no regression in existing project-page functionality.
- **SC-003**: The team/subscriber/copy summary shown for a skill matches the real underlying counts with 100% accuracy at page-load time.

## Assumptions

- "Subscribers" in the summary pill means the total number of subscription grant rows for the skill across all subscriber types (people + teams + projects combined) — not the mockup's fabricated per-team drill-down numbers, which have no real backing mechanism in this system.
- "Copies" in the summary pill means the count of skills anywhere in the organization recorded as forked from this one, regardless of who owns those forks or whether the viewing user can see them.
- The mockup's inconsistent "Share"/"Revoke" labeling for the Teams section is intentionally normalized to "Grant"/"Revoke" (matching People and Projects) rather than reproduced literally — an explicit decision made during design review, not an oversight.
- The mockup's simplified header (only Share + New Version) reflects it being a prototype of one screen, not a design intent to remove the skill page's existing fork/Deprecate/Reactivate functionality — those stay untouched.
- No database migration is required — every entity involved (subscriptions, prompts.forkedFromSkillId, project skill assignments) already exists; this feature only adds one new read query (a fork count) and removes/relabels UI surfaces.
