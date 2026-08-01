# Feature Specification: Prompt Registry Views UI

**Feature Branch**: `023-prompt-registry-views-ui`

**Created**: 2026-07-31

**Status**: Draft

**Input**: User description: "backlog/006-prompt-registry/006-prompt-registry-views-ui.md — pull the SkillCanon Prompts mockup (`SkillCanon Prompts.dc.html`) from the claude.ai/design project at https://claude.ai/design/p/7babdbf3-c063-46b5-84df-ffa9f588d88a and implement the real, finished Prompts + Projects UI it defines, composed into the existing app shell."

## Clarifications

### Session 2026-07-31

- Q: Granting a project direct access to a prompt (new scope added during `/speckit-specify`) — what does that access actually mean? → A: Same as team subscription — the project becomes a subscriber kind alongside user/team; every project member gets the prompt in their own accessible-prompts list, live-tracking its active version, resolved the same way team subscriptions already are.
- Q: The mockup shows a "deprecated" badge everywhere but has no control to set or unset it, and the existing `deprecatePrompt` capability is one-way (no reactivate). Should this feature add a way to deprecate a prompt, and is reactivation in scope? → A: Add both — a Deprecate action and a Reactivate action, the latter requiring a new backend capability alongside the existing one-way `deprecatePrompt`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse, search, and inspect a prompt (Priority: P1)

A user opens the Prompts page to find a reusable prompt template, narrows the list by search or filter, and opens one to see exactly what it sends to the model — its raw templates, a rendered preview with governance policies applied, and which policies were applied.

**Why this priority**: This is the core "reader" workflow the whole registry exists to support — every other capability (creating, versioning, sharing, project curation) is only valuable if people can first find and understand a prompt. It's also the only way to verify that governance policies are actually being applied as expected, which is the registry's core trust guarantee.

**Independent Test**: Can be fully tested by opening the Prompts page, searching/filtering to a known prompt, opening its detail view, and confirming the rendered preview reflects both the template and its applied policies — delivers value with no other story implemented.

**Acceptance Scenarios**:

1. **Given** prompts exist that the user can access, **When** they open the Prompts page, **Then** they see a list showing each prompt's name, deprecated status (if any), associated project(s), owner, active version, tags, and last-updated date.
2. **Given** a populated prompt list, **When** the user types a search term or picks a project/ownership filter, **Then** the list narrows to matching prompts, and an active filter can be cleared in one action.
3. **Given** no prompts exist yet, **When** the user opens the Prompts page, **Then** they see messaging inviting them to create their first prompt, distinct from the messaging shown when filters simply match nothing.
4. **Given** a prompt with an active version, **When** the user opens its detail view, **Then** they can see the active version's system template, user template, and declared input variables, a rendered preview of the system/user messages with governance policies applied, and the list of applied policies with their enforcement type.
5. **Given** a prompt the user owns, **When** they deprecate it from its detail view, **Then** it is visually flagged as deprecated everywhere it appears, and the user can later reactivate it, clearing that flag everywhere.

---

### User Story 2 - Create a prompt and publish new versions (Priority: P2)

A prompt owner creates a new prompt, and later iterates on it by publishing new versions as requirements change, without ever losing access to what a previous version looked like.

**Why this priority**: Authoring is the second-most-common workflow after browsing, and versioning is the registry's core integrity guarantee (nothing is ever silently overwritten) — this has to work before sharing or project curation are useful, since there'd be nothing to share or curate.

**Independent Test**: Can be fully tested by creating a new prompt, publishing a second version of it with different templates, confirming both versions remain independently viewable, and switching which one is active — delivers value with only User Story 1 implemented alongside it.

**Acceptance Scenarios**:

1. **Given** the user is on the Prompts page, **When** they create a new prompt with a name, description, system template, user template, and optional tags, **Then** the new prompt appears in the list as its own first version.
2. **Given** an existing prompt, **When** the user publishes a new version with edited templates and tags, **Then** a new, immutable version is created — the previous version's content is unchanged and still viewable — and the user can choose whether the new version becomes active immediately.
3. **Given** a prompt with multiple versions, **When** the user opens its version history, **Then** they see every version with its creation date, tags, and active/inactive status, and can set any prior version as active.

---

### User Story 3 - Share a prompt with people and teams (Priority: P3)

From a prompt's detail page, a user subscribes an individual, a team, or a project to it so they always get the latest version, or forks their own independently-editable copy — usable by the prompt's owner, but equally by anyone who administers the team/project being subscribed (creating a grant is authorized by whoever has authority over the *recipient*, not exclusively by the prompt's owner — see FR-015).

**Why this priority**: Sharing is what turns individually-authored prompts into an organization-wide registry, but it's only valuable once prompts exist and are versioned (Stories 1–2), and it's lower-frequency than browsing or authoring for any single user.

**Independent Test**: Can be fully tested by sharing a prompt with a user and a team, confirming both appear as having access with the correct subscriber/copy counts, and revoking one of those grants — delivers value once Stories 1–2 exist.

**Acceptance Scenarios**:

1. **Given** a prompt visible in the organization's catalog, **When** a user who administers a team or project (or is acting for their own account) opens that prompt's sharing controls, **Then** they can subscribe that recipient to the prompt or fork an independent copy, and see the current list of everyone/everything with access.
2. **Given** a prompt already shared with a team, **When** an authorized user (the team's own admin/owner, or an org admin) revokes that team's access, **Then** the team no longer appears as having access, and the prompt's shared-team/subscriber/copy counts update accordingly.
3. **Given** a shared prompt, **When** any user views its detail page, **Then** they see how many teams it's shared with and the total subscriber and copy counts across those teams.

---

### User Story 4 - Curate and organize project prompts (Priority: P4)

A project lead sets up a project's identity (owner/collaborator teams, lead, linked repositories) and curates which of the org's prompts are required or optional for that project's contributors to use.

**Why this priority**: Projects are the organizing unit that ties prompts to real engineering work, but this workflow depends on prompts already existing (Stories 1–2) and is used less frequently — typically at project setup time and when curation changes — than day-to-day prompt browsing.

**Independent Test**: Can be fully tested by creating a project, adding a collaborator team, linking a repository, and marking a prompt as required and then optional — delivers value once prompts exist to curate.

**Acceptance Scenarios**:

1. **Given** projects exist, **When** the user opens the Projects page, **Then** they see each project's name, associated team(s), description, lead, member count, and prompt count.
2. **Given** the user is on the Projects page, **When** they create a new project with a name, owning team, lead, and description, **Then** the new project appears in the list.
3. **Given** an open project, **When** the user views its detail page, **Then** they can navigate between its member list, curated prompts, linked repositories, and associated teams.
4. **Given** a project and a prompt already available to one of that project's participating teams, **When** the user marks the prompt required or optional for the project (or removes the association), **Then** the prompt moves into the corresponding section and the project's prompt count updates.
5. **Given** a project with no linked repositories, **When** the user adds one with a name, URL, and branch, **Then** it appears in the project's repository list and can later be removed.
6. **Given** a project, **When** the user adds or removes an associated (collaborator) team, **Then** the team list and count update accordingly.

---

### Edge Cases

- A prompt has only one version (its first): version history and version-switching controls still render correctly with nothing else to switch to.
- A prompt is marked deprecated: it still appears in lists and remains fully viewable/versionable, but is visually flagged as deprecated everywhere it's shown.
- Search and multiple filters are combined and none match anything: the "no results" empty state (not the "nothing exists yet" one) is shown, with an option to clear filters.
- A project has no repositories, no curated prompts, or no collaborator teams yet: each section shows its own empty state rather than looking broken or omitted.
- Removing a project's last remaining collaborator team, or unassigning a project's last required/optional prompt, leaves the project in a valid, still-viewable state.
- A prompt is already shared with every team in the org: the "share to another team" picker reflects that there's nothing left to add.
- Two people publish new versions of the same prompt around the same time: both versions are preserved as distinct, immutable versions; no edit is silently lost or overwritten.
- A prompt is assigned to a project (required/optional) but its owning team is not one of that project's participating teams: this assignment is not offered as an option (a prompt can only be curated into a project via a team already participating in that project).

## Requirements *(mandatory)*

### Functional Requirements

**Prompts — browse, search, filter**

- **FR-001**: System MUST display a list of every prompt the current user can access (prompts they own, prompts shared with them individually, prompts shared with a team they belong to, and prompts made accessible through project curation), showing each prompt's name, deprecated status, associated project(s) if any, owner, active version number, tags, and last-updated date.
- **FR-002**: Users MUST be able to search the prompt list by free-text matching against name and description.
- **FR-003**: Users MUST be able to filter the prompt list by a specific project, and independently by ownership (all prompts / prompts they own / prompts shared with their team).
- **FR-004**: Users MUST be able to clear all active search and filter criteria in a single action.
- **FR-005**: System MUST show a distinct "nothing exists yet" empty state versus a "no results for these filters" empty state, and the latter MUST offer to clear filters.

**Prompts — create and view detail**

- **FR-006**: Users MUST be able to create a new prompt by supplying a name, description, an initial system template, an initial user template, and optional free-text tags.
- **FR-007**: Users MUST be able to open a prompt's detail view showing its name, deprecated status, owner, associated project(s), full description, and active version.
- **FR-008**: Users MUST be able to view the active version's system template, user template, and declared input schema (each variable's name, type, and whether it's required).
- **FR-009**: Users MUST be able to view a rendered preview of the active version's system and user messages with all applicable governance policies already applied, using representative sample input.
- **FR-010**: Users MUST be able to view the list of governance policies applied to the active version, each showing its label and enforcement type (prepend / append / inject / validate).
- **FR-010a**: Prompt owners MUST be able to mark a prompt deprecated, and MUST be able to reverse that (reactivate a deprecated prompt) — both actions available from the prompt's detail view, with the prompt's deprecated state reflected everywhere it's shown (list and detail).

**Prompts — versioning**

- **FR-011**: Users MUST be able to publish a new version of a prompt by supplying an edited system template, user template, and tags; publishing MUST always create a new, additional, immutable version and MUST NOT modify the content of any existing version.
- **FR-012**: When publishing a new version, users MUST be able to choose whether it becomes the prompt's active version immediately or the current active version remains active.
- **FR-013**: Users MUST be able to view the full version history of a prompt — every version's number, creation date, tags, and whether it is currently active.
- **FR-014**: Users MUST be able to set any existing version of a prompt as its active version.

**Prompts — sharing**

- **FR-015**: Users MUST be able to create a grant of an individual user, a team, or a project to a prompt, and MUST be able to revoke any grant independently of the others. Creating or revoking a grant is authorized by whoever has authority over the *recipient*, not by the prompt's owner specifically: a user may only grant/revoke access for themselves; a team or project grant requires the acting user to be an admin/owner of that team (or, for a project, an admin/owner of the project's owner team) or an organization admin. A prompt's own owner therefore has this authority automatically only over teams/projects they themselves administer — the same rule already governing every other team/project-administration action in this system, not a new one introduced by sharing. A project-level grant is a subscription: it immediately makes the prompt accessible to every current and future member of that project, live-tracking the prompt's active version, the same way a team-level subscription works for that team's members.
- **FR-016**: A grant recipient (a user, a team, or — via its members — a project) MUST be able to either subscribe (their access always reflects the prompt's current active version) or fork (create their own independently-editable copy); a project-level grant itself is always a subscription (see FR-015), but any individual member of that project MAY still separately fork their own independent copy.
- **FR-017**: For a shared prompt, the system MUST display how many teams and projects it is shared with and the total number of subscribers and copies across those grants.
- **FR-018**: System MUST reflect, in the sharing controls, which users/teams/projects already have a grant versus which are still available to add.

**Projects — browse, create**

- **FR-019**: System MUST display a list of every project, showing its name, associated team(s), description, lead, member count, and curated-prompt count.
- **FR-020**: Users MUST be able to create a new project by supplying a name, an owning team, a lead, and a description.

**Projects — detail, teams, members**

- **FR-021**: Users MUST be able to open a project's detail view, organized into distinct sections for its members, curated prompts, linked repositories, and associated teams.
- **FR-022**: Users MUST be able to view and manage the project's associated (collaborator) teams — adding a team not yet associated, and removing one that is — in addition to its owner team and lead, which are shown for reference.
- **FR-023**: Users MUST be able to view the project's members, each with their role, and to add or remove an individual member from the project independent of team membership.

**Projects — prompt curation**

- **FR-024**: Users MUST be able to curate which prompts apply to a project, marking each one required, optional, or unassigned; a prompt is eligible for curation into a project only if it is already owned by one of that project's participating teams (a subscribed-in or forked-in prompt is not itself eligible — only genuine team ownership qualifies).
- **FR-025**: The project detail view MUST present curated prompts grouped by their status (required / optional) plus the set of eligible-but-uncurated prompts, and MUST let a user move a prompt between these groups or remove its curation.

**Projects — repositories**

- **FR-026**: Users MUST be able to link a git repository to a project by supplying a name, URL, and branch, and to remove a previously linked repository.

### Key Entities

- **Prompt**: A reusable, versioned template owned by exactly one user or one team. Has a name, description, deprecated flag, one active version, and zero or more shared grants (to users, teams, or projects).
- **Prompt Version**: One immutable snapshot of a prompt's content — a system template, a user template, a declared input schema (named, typed variables), tags, and the governance policies that were applied to it at render time. A prompt has exactly one active version at a time, chosen from all of its versions.
- **Project**: A team-owned workspace that groups prompts and members across teams. Has a name, description, an owner team, a lead, zero or more collaborator (associated) teams, zero or more members, zero or more linked git repositories, and a curated set of prompts each marked required or optional.
- **Sharing Grant**: A record that a specific user, team, or project has been given access to a specific prompt, either as a live subscription (tracks the prompt's active version — always the case for a project-level grant, which extends access to every member of that project) or as the origin of an independent fork (a separate prompt with no further connection to the source).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can find a specific known prompt and open its detail view, including its rendered preview and applied policies, in under 30 seconds.
- **SC-002**: A user can create a new prompt and publish a second version of it without needing any explanation of what "version" or "active version" means beyond what's shown on screen.
- **SC-003**: 100% of a prompt's prior versions remain fully viewable and re-activatable after any number of subsequent versions have been published.
- **SC-004**: A project lead can set up a new project (team, lead, description, one linked repository, one curated required prompt) in a single sitting without leaving the Projects section.
- **SC-005**: Every workflow described in the user stories (browse/search/view, create/version, share, curate a project) is completable end-to-end through this UI with no gaps requiring a different tool or a direct database/API action.

## Assumptions

- This feature builds the UI and any supporting application-layer logic against prompt, version, sharing, and project-curation capabilities already delivered by `002-prompt-and-version-model`, `003-prompt-sharing`, and `007-project-skill-assignment` (all archived/done). Extending project-level sharing (FR-015's "grant a project access") is new scope this feature adds to the existing subscription/access model: a project becomes a third subscriber kind alongside the existing `"user" | "team"` values (see Clarifications), resolved through the same accessible-prompts query rather than a parallel mechanism.
- The Project Detail "Metrics" tab shown in the design mockup (invocation counts, required-skill coverage, usage trends broken down by skill/branch/member) is **out of scope** for this feature. It depends on a per-invocation usage log (which prompt ran, in which repo/branch, by which user, when) that no existing epic captures yet. Building it now would mean introducing new usage-tracking capture as a side effect of a "views UI" feature, which this spec deliberately avoids — building a dashboard with no real data behind it would leave it half-finished. Project Detail therefore ships with Members, Prompts, Repositories, and Teams sections only; a Metrics/analytics dashboard is tracked as a separate future backlog item once an actual invocation-logging source exists (see `backlog/006-prompt-registry/008-project-usage-metrics-dashboard.md`).
- The design mockup explores three alternate visual layouts for the prompt detail's template/preview/policies content (a tabbed layout, a side-by-side split layout, and a form-with-live-preview layout), but only the tabbed layout is ever reachable through any control in the mockup — the other two have no wired entry point. This feature implements only the tabbed layout; the other two are treated as discarded design exploration, not a user-facing choice to build.
- Prompt ownership displayed in this UI can be either a user or a team, consistent with the existing prompt/sharing model, even though the mockup's sample data shows only user-owned prompts.
- Reactivating a deprecated prompt (FR-010a) is new scope this feature adds alongside the existing one-way `deprecatePrompt` capability (`002-prompt-and-version-model`) — no prior feature modeled reversing deprecation, so the corresponding write path is new, not just new UI over an existing function.
- This feature composes into the existing app shell and navigation (`backlog/004-app-shell-and-landing/002-app-shell-and-navigation.md`) rather than building its own shell, sidebar, or account menu.
- Adding/removing an individual project member (FR-023) is included even though the source mockup's "+ add member" control had no wired behavior — this mirrors the working "add team" and "add repository" patterns already present in the same mockup, and project membership is a real, independent capability per `001-project-model-and-membership`.
- **Correction (post-`/speckit-analyze`, finding F1)**: FR-015's original wording ("Prompt owners MUST be able to grant...") was corrected after `/speckit-analyze` found it inconsistent with the actual, already-shipped authorization rule this feature reuses unmodified (`assertAuthorizedForOwner`) — that rule authorizes whoever administers the *recipient* team/project (or a user acting for themselves), never checking the prompt's own owner at all. The corrected wording and User Story 3 reflect the real, existing model rather than inventing owner-exclusive gating this feature was never going to build.
