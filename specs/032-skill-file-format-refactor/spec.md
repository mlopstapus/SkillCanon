# Feature Specification: Skill File Format Refactor

**Feature Branch**: `032-skill-file-format-refactor`

**Created**: 2026-08-05

**Status**: Draft

**Input**: User description: "`/Users/ben/repos/SpecHub/backlog/006-prompt-registry/011-skill-file-format-refactor.md` — per PDR-018, replace a skill version's flat `{{var}}`-templated system/user strings and unused `input_schema` with a required Markdown main file plus zero or more named supporting files, matching the real Claude Code skill convention; `expand()` drops its `input` parameter entirely. UI reference: Claude Design project `7babdbf3-c063-46b5-84df-ffa9f588d88a`, file `SkillCanon Skills.dc.html` (imported via the `DesignSync` tool), which shows the target skill-detail Overview/Files tabs, file preview/plain-text/edit views, and New skill/New version authoring drawers."

## Clarifications

### Session 2026-08-06

- Q: For a legacy-shape (pre-migration) skill version opened in the app — one with old systemTemplate/userTemplate content but no main/supporting file records at all — what should the skill detail page show? → A: Hide the Files tab entirely for that version. Its Overview instead shows the original system/user template content inline (read-only), with a note that it predates file-based skills.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Publish a skill version as instructions plus files (Priority: P1)

A skill owner publishes a new version of their skill by writing its instructions as a single Markdown document (the skill's "main file") and, optionally, attaching one or more named supporting files (a checklist, an example, a reference template) that the main file's instructions can point to by name. There is no structured "input schema" to define — the skill is invoked, not called with arguments.

**Why this priority**: This is the core capability change PDR-018 exists to deliver. Every other story depends on skill content actually being authored and stored in this shape.

**Independent Test**: Publish a new version of an existing skill with a main file and two supporting files; verify all three are stored and returned correctly, and the version becomes the org's active version when the author chooses to set it active.

**Acceptance Scenarios**:

1. **Given** an existing skill, **When** its owner publishes a new version supplying main-file content and two supporting files with distinct names, **Then** the version is created and all three files are retrievable exactly as authored.
2. **Given** a version being published, **When** the author supplies no supporting files at all, **Then** publishing still succeeds with just the required main file.
3. **Given** a version being published, **When** the author supplies two supporting files with the same name, **Then** the system rejects the publish with a clear error rather than silently overwriting one.
4. **Given** a chain-kind version being published (a sequence of steps referencing other skills), **When** the author publishes it, **Then** it is entirely unaffected by this change — chain versions never used templates or files this way.

---

### User Story 2 - Invoke a skill with no supplied input (Priority: P1)

A caller (Claude Code, another agent, the REST API, or the MCP `sh-run` tool) expands a skill by name alone. The system resolves the skill's current markdown content, weaves in the caller's applicable governance policies and objectives exactly as it does today, and returns the result — with no per-call argument object to construct or validate.

**Why this priority**: This is the other half of the breaking contract change; every existing and future consumer of `expand()` depends on this new calling shape.

**Independent Test**: Call `expand()` for a published template-kind skill with no `input` argument; verify it returns resolved content with applied policies/objectives, proven by test — matching Acceptance Criterion 2 of the source backlog item.

**Acceptance Scenarios**:

1. **Given** a published skill with an active template-kind version, **When** a caller expands it by name with no input payload, **Then** the response contains the resolved markdown content plus the applied policy names and objective titles for that caller.
2. **Given** a skill whose main file uses `include_prompt('other-skill')`, **When** it is expanded, **Then** the nested skill's own current content is resolved and included, still bounded by the existing maximum nesting depth.
3. **Given** an unauthenticated/ungoverned expansion request (no acting user), **When** the skill is expanded, **Then** it still resolves successfully with empty applied-policies/objectives lists, exactly as today.

---

### User Story 3 - Browse and author a skill's files in the app (Priority: P2)

A skill owner or viewer opens a skill's detail page and sees an Overview summarizing the version's file count, applied policies, and owner, plus a Files tab listing the main file and any supporting files. Selecting a file shows its content, with a Preview/Plain-text toggle for the main file (rendered as formatted Markdown, or as raw text) and an Edit affordance to modify content, add a new supporting file, or remove a supporting file.

**Why this priority**: Authoring and reviewing skill content through the app is how most skill owners will actually use this feature day to day; it's dependent on Story 1's data model existing but is otherwise its own slice.

**Independent Test**: Open a published template-kind skill in the app; confirm the Files tab lists the main file plus any supporting files, that selecting a file shows its content, and that the Preview/Plain-text toggle changes how the main file's Markdown renders.

**Acceptance Scenarios**:

1. **Given** a skill version with a main file and one supporting file, **When** its owner opens the Files tab, **Then** both files are listed, with the main file visually marked as required/main.
2. **Given** the main file is selected, **When** the viewer toggles from Preview to Plain text, **Then** the display switches from rendered Markdown blocks to the file's raw text.
3. **Given** a supporting file is selected, **When** the owner clicks Edit, **Then** the content becomes editable and can be saved or the edit discarded.
4. **Given** the Files tab, **When** the owner adds a new file, **Then** it appears in the supporting-files list and can be selected and edited like any other supporting file.
5. **Given** the main file, **When** the owner looks for a way to remove it, **Then** no such control is offered — the main file cannot be deleted, only edited via a new version.

---

### User Story 4 - Existing published skills keep working unchanged (Priority: P1)

An organization with skills published before this feature shipped continues to use them exactly as before: expanding them still succeeds, and their content is still whatever was published under the old flat-template shape. No automatic conversion runs against them, and no owner is forced to take action.

**Why this priority**: Without this, shipping the feature would break every already-published skill in every organization the moment it deploys — an unacceptable regression, and the reason a migration strategy was called out as an explicit open decision.

**Independent Test**: Expand a pre-existing (old-shape) published version after the feature ships; verify it still resolves without error, per whichever migration strategy is chosen.

**Acceptance Scenarios**:

1. **Given** a version published before this feature shipped (old flat-template shape), **When** it is expanded, **Then** it resolves successfully with no error, using its originally-published content.
2. **Given** an old-shape version, **When** its owner wants the new files/template-reference capability, **Then** they publish a brand-new version in the new markdown+files shape — the old version itself is never rewritten or auto-converted.
3. **Given** an old-shape version viewed in the app, **When** its owner opens it, **Then** no Files tab is offered for that version — its Overview instead shows the original system/user template content inline (read-only), with a note that it predates file-based skills.

---

### Edge Cases

- What happens when a supporting file's content exceeds the enforced per-file size cap? Publish is rejected with a clear error identifying which file and the limit.
- What happens when a version's total file count exceeds the enforced cap? Publish is rejected with a clear error.
- What happens when `include_prompt('name')` is used and the included skill is itself an old-shape (pre-migration) version? It still resolves using that version's legacy content, composed into the including skill's markdown the same way new-shape inclusions are.
- How does the system handle a caller still sending a legacy `input` object to `expand()`? It is ignored/rejected as an unrecognized parameter — there is no partial-compatibility mode.
- What happens if an author tries to publish a version with an empty main file? Rejected — the main file is required and must be non-empty, consistent with today's requirement that a template-kind version have real content.
- What happens when two organizations' skills share a supporting file name? No conflict — file names are unique only within a single skill version, not globally.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST replace `prompt_versions.system_template`, `user_template`, and `input_schema` with a required Markdown main-file content field plus storage for zero or more named supporting files, for template-kind versions.
- **FR-002**: `expand()` MUST remove its `input` parameter entirely; callers identify only the organization, skill name, optional acting user, optional project, and optional version.
- **FR-003**: `expand()` MUST return the resolved main-file Markdown content (with governance policies/objectives woven in, exactly as freshly as today) plus the list of applied policy names and resolved objective titles.
- **FR-004**: `publishVersion` MUST accept the new main-file-plus-supporting-files shape for template-kind versions; chain-kind versions (a sequence of steps) are unaffected by this change and keep their existing publish shape.
- **FR-005**: The system MUST enforce exactly one main file per template-kind version, named `SKILL.md`, that cannot be removed (only superseded by publishing a new version).
- **FR-006**: The system MUST allow zero or more supporting files per version, each with a name unique within that version, that can be added, edited, or removed independently of the main file up until the version is published.
- **FR-007**: The system MUST enforce a maximum file count and a maximum per-file size for a version's file bundle, rejecting a publish attempt that exceeds either with a clear, specific error.
- **FR-008**: `include_prompt('name')` recursive inclusion MUST continue to work against the new main-file Markdown content, bounded by the existing maximum nesting depth, unchanged.
- **FR-009**: Policy/objective injection (prepend/append/inject, sandboxed template rendering) MUST continue to apply to the resolved main-file content exactly as it applies to the resolved template today.
- **FR-010**: Every skill version published before this feature ships MUST continue to resolve via `expand()` without error, using its originally-published (legacy) content, with no automatic conversion applied to it.
- **FR-011**: A skill owner MUST be able to give an old-shape skill the new capability only by publishing a brand-new version in the markdown-plus-files shape; the system MUST NOT rewrite or reinterpret an already-published version's stored content.
- **FR-012**: `input_schema` and the `input` parameter MUST be removed from `expand()`'s REST route and the MCP `sh-run` tool's argument shape, matching the new calling contract (the CLI's own stub/sync rework is tracked separately and is out of scope here).
- **FR-013**: The skill detail page's Overview tab MUST show the active version's file count, active-version number, applied-policy count, and owner, matching the existing card-based summary layout.
- **FR-014**: The skill detail page MUST offer a Files tab listing the main file and all supporting files for the version being viewed, visually distinguishing the main (required) file from supporting ones.
- **FR-015**: Selecting a file in the Files tab MUST show its content; for the main file, the viewer MUST be able to toggle between a rendered Markdown preview and the raw plain-text source.
- **FR-016**: The Files tab MUST let an owner add a new supporting file, edit any file's content, and remove a supporting file (never the main file) while authoring the currently-open version.
- **FR-017**: The "publish new version" flow MUST collect the main file and any supporting files (plus tags) for a template-kind version, replacing the prior system-template/user-template text fields.
- **FR-018**: The "create new skill" flow MUST collect only name, description, and tags; the skill's first version content (main file plus any supporting files) MUST be authored through the same file-based publish flow used for every subsequent version, not a separate template-entry form.
- **FR-019**: For a version published before this feature shipped (no file records), the skill detail page MUST NOT offer a Files tab; its Overview MUST instead show that version's original system/user template content inline, read-only, with a note indicating it predates file-based skills.

### Key Entities *(include if feature involves data)*

- **Skill Version (template-kind)**: A single published, immutable revision of a skill's content. For versions published under this feature, its content is a required main Markdown file (`SKILL.md`) plus zero or more named supporting files, replacing the old `systemTemplate`/`userTemplate`/`inputSchema` fields. Versions published before this feature keep their original stored shape and resolve unchanged.
- **Skill Version File**: A named file (main or supporting) belonging to one template-kind skill version. Attributes: name (unique within its version), content, and whether it is the required main file. Supporting files may be added, edited, or removed only while their version is being authored — once published, a version's files are immutable, same as the version itself.
- **Skill Version (chain-kind)**: Unchanged by this feature — a sequence of steps, each referencing another skill by name/version.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A skill owner can publish a new version containing instructions plus two supporting reference files in a single publish action, defining zero structured input parameters.
- **SC-002**: Every skill version published before this feature ships continues to expand successfully afterward, with zero required owner action and zero automatic content changes applied to it.
- **SC-003**: 100% of skill expansions succeed with no per-call input payload of any kind — the request needs only to identify which skill (and optionally which version) to expand.
- **SC-004**: A skill viewer can locate and read the content of any file (main or supporting) in a skill version within two navigation actions from the skill's detail page.
- **SC-005**: No skill version in the system can be published exceeding the enforced per-file size cap or per-version file-count cap — every publish attempt that would exceed either is rejected before being stored.

## Assumptions

- **Migration strategy**: "Require re-publish," confirmed with the user. Already-published (legacy-shape) versions keep resolving exactly as before, forever, using their originally-stored `systemTemplate`/`userTemplate` content — there is no background conversion job and no forced re-publish deadline. An owner only gets the new files/template-reference capability by publishing a brand-new version.
- **Main file name**: The required main file is always named `SKILL.md`, matching the real Claude Code skill convention PDR-018 explicitly targets, and cannot be renamed.
- **Per-file size cap**: 64 KB per file, mirroring the existing opaque-output cap precedent already established for `advanceSkillChainRun` (backlog `archive/009-skill-chains.md`) — the exact figure is confirmed during planning, not re-litigated here.
- **Per-version file count cap**: A modest cap (e.g. main file plus up to 20 supporting files) is enforced to keep the authoring UI and API bundle size reasonable; exact figure confirmed during planning.
- **New-skill creation UX**: The mockup's "New skill" drawer still shows legacy System-template/User-template fields inconsistent with the "New version" drawer's file-based editor. This spec resolves that inconsistency by having skill creation collect only name/description/tags, then continue into the same file-based publish flow used for every later version — there is no separate, second content-authoring UI to maintain.
- **REST/MCP scope**: This feature updates the REST `expand` route and the MCP `sh-run` tool only to match `expand()`'s new signature/response shape, since both call `expand()` directly and would otherwise break. It does not rework the CLI's `skillcanon run`/sync mechanism — that is `008-distribution/007-skill-file-format-cli-support.md`'s scope, per the source backlog item's own Technical Notes.
- **Chain-run display follow-on**: The mockup's chain run-history panel still renders separate "System message sent" / "User message sent" panes per step. Since `expand()` no longer produces a system/user split, that display will need a follow-on update once chain-kind steps invoke a skill in the new shape — out of scope for this feature (chain run recording/display is owned by the skill-chains features), but worth tracking as a forward dependency.
- **Module-boundary lint and `expand-characterization.test.ts`-style equivalence tests** are updated to assert the new shape (per the source backlog item's own Acceptance Criteria) as part of this feature's implementation, not deferred.
