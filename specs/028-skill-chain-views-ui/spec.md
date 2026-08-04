# Feature Specification: Skill Chain Views UI

**Feature Branch**: `027-skill-chain-views-ui`

**Created**: 2026-08-02

**Status**: Draft

**Input**: User description: "backlog/006-prompt-registry/010-skill-chain-views-ui.md — pull the `SkillCanon Skills.dc.html` mockup from the claude.ai/design project at https://claude.ai/design/p/7babdbf3-c063-46b5-84df-ffa9f588d88a and implement the chain-specific UI it defines (viewing a chain version's step list, viewing a chain's run history, and authoring a new chain version through a step builder), composed into the existing Skills (Prompt Registry) pages rather than a separate route."

## Clarifications

### Session 2026-08-02

- Q: How should the Run History list behave once a chain has accumulated many runs? → A: Paginated, matching the existing audit-log-ui numbered Prev/Next precedent for potentially-large historical-record lists — requires extending `listSkillChainRuns` with `page`/`pageSize` parameters, since it currently returns every run unbounded.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Understand what a chain skill does by viewing its steps (Priority: P1)

A user opens a chain-kind skill and sees, at a glance, the ordered list of steps it's made of — which skill each step invokes, which version (or "latest"), and which earlier step(s) it depends on — the same way they can already read a template skill's raw content and rendered preview.

**Why this priority**: This is the trust-and-understanding workflow every other chain capability depends on — nobody should have to guess what a chain will do, or read raw API responses, to know what it's composed of. It's also the only way to verify a chain was authored correctly before anyone runs it.

**Independent Test**: Can be fully tested by opening any chain-kind skill's detail page and confirming its full, correctly-ordered step list (target skill, pinned version if any, and dependencies) is visible — delivers value even if no other story is implemented, since chains can already be authored directly against the existing API.

**Acceptance Scenarios**:

1. **Given** a chain-kind skill version, **When** a user opens its detail page, **Then** they see a "Steps" section listing every step in order, each showing the step's position, the name of the skill it invokes, the specific version it targets (or an indication that it always uses the latest version), and which earlier step(s) it depends on.
2. **Given** a chain's step list, **When** the user selects one of its steps, **Then** they are taken to that step's own referenced skill's detail page.
3. **Given** a chain version with no steps, **When** a user views its Steps section, **Then** they see a clear message that no steps are defined, not an empty-looking list.
4. **Given** a skill with multiple versions where some are template-kind and others are chain-kind, **When** the active version changes from one kind to the other (e.g. via "Set active" in version history — this page has no way to preview a non-active version's content, for either kind, and this feature doesn't add one), **Then** the page shows the correct kind-specific content for whichever version is now active.

---

### User Story 2 - Review a chain's run history (Priority: P2)

A user opens a chain skill's Run History to see every past attempt at walking that chain — its overall status, and for each step, exactly what was sent to be run and what the caller reported back — without needing direct database or API access.

**Why this priority**: This is the auditability payoff of building chain runs as persisted, structured records instead of throwaway request/response pairs — but it only matters once chains exist and have actually been run, so it's naturally second to understanding a chain's definition.

**Independent Test**: Can be fully tested by viewing the run history of a chain that has at least one completed and one failed run, and confirming each run's overall status and every step's sent content and self-reported outcome are visible — delivers value once chains exist and have been run, independent of whether the authoring UI (Story 3) exists.

**Acceptance Scenarios**:

1. **Given** a chain skill with no runs yet, **When** a user opens its Run History section, **Then** they see messaging explaining that runs happen client-side and will appear here once a caller reports progress.
2. **Given** a chain skill with one or more runs, **When** a user opens its Run History section, **Then** they see each run's overall status (in progress / completed / failed / abandoned) and when it started, most-recent first, loaded a page at a time.
3. **Given** a run, **When** the user expands one of its steps, **Then** they see the exact system and user message that was sent for that step and the caller's self-reported outcome for it, with any reported error message shown clearly if the step failed.
4. **Given** a run where one step was reported as failed, **When** the user reviews the steps after it, **Then** it's visually unambiguous that those steps received no real output from the failed step, distinct from steps that received real prior output.
5. **Given** a chain with more than one published version, **When** a user reviews its run history, **Then** they can tell which version of the chain each run executed.
6. **Given** a run's step detail, **When** the user views it, **Then** there is no control anywhere in the Run History view that starts, advances, or abandons a run — this view is read-only.
7. **Given** a chain skill with more runs than fit on one page, **When** the user navigates to the next page, **Then** the next set of older runs replaces the current page, with a way to move back to a more recent page — matching this app's existing numbered-page pattern (e.g. the audit log), not an appending "load more" list.

---

### User Story 3 - Author a new chain version through a step builder (Priority: P3)

A skill owner publishes a new chain version by building its ordered step list directly in the same "publish a new version" flow already used for template skills, picking which skill each step invokes and wiring up dependencies, without hand-writing any raw data.

**Why this priority**: Authoring already works against the existing API/CLI without any UI at all, so this is a convenience and adoption improvement rather than a blocking dependency for Stories 1–2 — but it's still core to making chains approachable for people who'd rather not construct a step list by hand.

**Independent Test**: Can be fully tested by opening "New version" on any skill, switching to the Chain kind, building a multi-step chain with at least one dependency between steps, publishing it, and confirming it appears correctly in Story 1's step view — delivers value once Story 1 exists to confirm the result.

**Acceptance Scenarios**:

1. **Given** a user opening the "New version" flow for a skill, **When** they choose the Chain kind instead of Template, **Then** the form switches to a step builder and no template-only fields (system/user template, input schema) are shown.
2. **Given** the step builder, **When** the user adds a step, **Then** they can pick which skill it invokes from the set of skills they can access, optionally pin a specific version (leaving it blank always uses that skill's latest), and see it appear at the end of the current list.
3. **Given** a chain with two or more steps, **When** the user is configuring a step, **Then** they can mark it as depending on any step that appears earlier in the list, but are never offered a step at the same or a later position, or the step itself, as a dependency.
4. **Given** a multi-step chain being built, **When** the user reorders a step (moves it earlier or later) or removes a step entirely, **Then** the step list updates accordingly, and any other step that depended on a now-removed step no longer shows that dependency selected.
5. **Given** a completed step builder (including a chain with zero steps), **When** the user publishes, **Then** a new, immutable chain version is created, and — exactly like publishing a template version — the user could choose whether it becomes the active version immediately.
6. **Given** a chain version just published, **When** it is shared (subscribed to or forked) by another team or user, or assigned to a project, **Then** it works identically to how sharing/project-assignment already works for template versions, with no separate chain-specific sharing or curation controls.

---

### Edge Cases

- A chain version has zero steps: the Steps section shows a clear empty state, and if run, the corresponding run would show as immediately finished with no step detail to display.
- A run is stuck indefinitely "in progress" because the caller stopped reporting progress: it's still shown accurately as in-progress, with only the steps actually resolved so far, never presented as an error or as stuck/broken.
- A step in the run history references a skill that has since been deprecated or changed: the run still shows exactly what was sent and reported at the time, unaffected by the referenced skill's current state.
- Two chain versions of the same skill have different step lists (a later version added, removed, or reordered steps): each run's step detail reflects the step list of whichever version that particular run actually executed, not the currently-active version.
- A chain step's optional pinned version is left blank: the step is understood to always resolve against that skill's latest version at run time, both in the builder and in the read-only Steps view.
- The step builder's target-skill picker has nothing to offer because the user has no accessible skills yet: this is shown as a clear "no skills available yet" state rather than an empty, unexplained dropdown.

## Requirements *(mandatory)*

### Functional Requirements

**Chain skill detail — viewing steps**

- **FR-001**: When the version being viewed on a skill's detail page is a chain version, the system MUST show a "Steps" section and a "Run History" section instead of the template-kind sections (raw template, rendered preview, applied policies).
- **FR-002**: The Steps section MUST list every step in its defined order, showing each step's position, the name of the skill it invokes, the version it targets (or that it always uses the latest), and which earlier step(s), if any, it depends on.
- **FR-003**: Selecting a step in the Steps section MUST navigate to that step's own referenced skill.
- **FR-004**: A chain version with no steps MUST show a distinct "no steps defined" state rather than an empty list with no explanation.

**Chain skill detail — run history**

- **FR-005**: The Run History section MUST list every run of that chain skill, most-recently-started first, each showing its overall status (in progress / completed / failed / abandoned), when it started, and which chain version it executed. Runs MUST be shown a page at a time using the same numbered-page pattern already used elsewhere in this app (e.g. the audit log), not an unbounded single list.
- **FR-006**: A chain skill with no runs yet MUST show messaging explaining that runs happen client-side and will appear once a caller reports progress — distinct from a chain that has runs but none matching some other state.
- **FR-007**: Users MUST be able to expand any step within a run to see the exact system and user message sent for that step and the caller's self-reported outcome, including the reported error message when the step failed.
- **FR-008**: When a step was reported as failed, every subsequent step's displayed input from that dependency MUST be visually distinguishable as "no real output available" rather than looking like genuine prior output.
- **FR-009**: The Run History view MUST NOT expose any control that starts, advances, or abandons a run — it is read-only in every state.

**Authoring a new chain version**

- **FR-010**: The existing "publish a new version" flow MUST offer a choice between Template and Chain kinds; selecting Chain MUST replace the template-only fields with a step builder, and selecting Template MUST behave exactly as it already does today.
- **FR-011**: Users MUST be able to add a step to the builder, choosing which skill it invokes from the set of skills they can access, and optionally pinning a specific version (left blank to mean "always latest").
- **FR-012**: Users MUST be able to mark a step as depending on any earlier step in the same chain, and MUST NOT be offered that step itself, or any step at the same or a later position, as a valid dependency.
- **FR-013**: Users MUST be able to reorder steps and remove a step; removing a step MUST also clear it from any other step's selected dependencies.
- **FR-014**: Publishing a chain version — including one with zero steps — MUST create a new, immutable version exactly like publishing a template version does, including the same choice of whether it becomes the active version immediately.
- **FR-015**: A published chain version MUST support the same sharing (subscribe/fork) and project-assignment capabilities already available to template versions, with no separate chain-specific controls.

**Navigation**

- **FR-016**: Chain-kind and template-kind skills MUST remain browsable from the same skill list and detail pages used today — the system MUST NOT introduce a separate "workflows" (or similarly named) navigation entry or route.

### Key Entities

- **Chain Version**: A `PromptVersion` whose content is an ordered list of steps instead of template text. Immutable once published, and otherwise identical in lifecycle to a template version (ownership, versioning, sharing, project assignment).
- **Chain Step**: One entry in a chain version's step list — the skill it invokes, an optional pinned version of that skill, and the set of earlier steps within the same chain it depends on.
- **Chain Run**: One attempt at walking a chain version's steps — an overall status, a start time, an optional completion time, and which chain version it executed.
- **Chain Run Step**: One resolved step within a run — the exact content sent, and the caller's self-reported outcome (success, error, and an optional error message) for that step.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can determine every step a chain will execute, in order, including its dependencies, without leaving the skill's detail page.
- **SC-002**: A user reviewing a chain's run history can identify, for any past run, exactly what was sent for every step and what the caller reported back, with no gap requiring direct database or API access.
- **SC-003**: A user can tell, in under 10 seconds of opening a run, whether it succeeded, failed, is still in progress, or was abandoned, and — for a failed run — which specific step caused it.
- **SC-004**: A user can author and publish a working multi-step chain version entirely through this UI, without needing to construct or read any raw request payload.
- **SC-005**: A chain-kind and a template-kind skill are equally discoverable, shareable, and assignable to projects through the exact same controls — no user-facing distinction beyond the content shown on their detail page.

## Assumptions

- This feature is UI-only, built entirely on top of the already-complete `009-skill-chains` backend (archived, `backlog/006-prompt-registry/archive/009-skill-chains.md`) — chain-kind `publishVersion`, `startSkillChainRun`/`advanceSkillChainRun`/`abandonSkillChainRun`, and the read-only `listSkillChainRuns`/`getSkillChainRun`. This view never itself calls the run-advancing functions; running a chain happens entirely client-side in whichever agent/IDE is executing it.
- This composes into the existing Skills (Prompt Registry) route, detail page, and "New version" flow already shipped by `023-prompt-registry-views-ui` (archived) — no new route, page shell, or navigation entry is introduced, per FR-016 and PDR-017.
- Step identifiers are assigned automatically by the builder in creation order and are not directly user-editable; a step can only be wired to depend on a step already earlier in the list, which the builder enforces by construction (matching the backend's own no-forward/no-self-reference validation, rather than only catching it after publish).
- The mockup's "set as active version immediately" checkbox is only wired for the Template kind in the source design file; this feature extends the same control to the Chain kind for parity, since publishing already supports that choice identically for both kinds at the backend level — this is a small, reasonable completion of the mockup, not new backend scope.
- A run's originating chain version is already captured in the data model (`skill_chain_runs.prompt_version_id`) but is not currently returned by the existing `listSkillChainRuns`/`getSkillChainRun` read functions. Surfacing it (FR-005, Acceptance Scenario 5 of Story 2) is small new scope this feature adds to those two read paths — extending an existing query's returned shape, not introducing a new capability.
- `listSkillChainRuns` currently returns every run for a chain unbounded, with no pagination. Per the pagination decision (Clarifications), this feature extends it with the same `page`/`pageSize` parameters and `{ items, page, pageSize, total }` return shape already established by `audit-compliance`'s `listAuditEvents`, rather than introducing a new, one-off pagination pattern.
- Whether a long-idle "in progress" run should ever automatically expire is an explicitly open question left unresolved by `009-skill-chains` (no time-based expiry assumed by default). This feature takes no position on that question — it simply renders whatever state a run currently has.
- No new entitlement/billing gating is introduced by this feature. Billing (`backlog/009-billing-entitlements`) is currently deferred indefinitely, and no other Prompt Registry view feature gates on an entitlement flag today — this feature follows that same existing precedent.
