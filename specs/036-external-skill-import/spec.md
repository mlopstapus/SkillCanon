# Feature Specification: External Skill Registry Import

**Feature Branch**: `[036-external-skill-import]`

**Created**: 2026-08-10

**Status**: Draft

**Input**: User description: "/Users/ben/repos/SpecHub/backlog/013-skill-import-and-external-registries/001-external-skill-registry-import.md"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Import a single publicly-published skill (Priority: P1)

A user has found a skill published in a public GitHub repository (not their own) that they want to use in their organization. They point the import tool at that repository, and the skill's content — instructions plus any supporting files — is brought into their organization's own skill registry, owned by them, without them having to manually recreate or retype any of it.

**Why this priority**: This is the core value of the feature — bringing outside content in with a single action. Without this, the feature delivers nothing.

**Independent Test**: Can be fully tested by pointing the import tool at a public repository containing exactly one real skill and verifying a new, correctly-owned skill appears in the organization's registry with matching content.

**Acceptance Scenarios**:

1. **Given** a public GitHub repository containing exactly one valid skill, **When** the user imports from that repository, **Then** a new skill is created in their organization, owned by them, with instructions and supporting files matching the source.
2. **Given** a repository the user does not own or have write access to, **When** the user imports from it, **Then** the import still succeeds (no ownership or write-access check against the source is performed).
3. **Given** a source location that contains no recognizable skill content, **When** the user attempts an import, **Then** the import fails with a clear message explaining nothing importable was found.

---

### User Story 2 - Choose which skills to import from a multi-skill source (Priority: P2)

A user points the import tool at a repository that publishes several skills (for example, a folder containing multiple skill subfolders). They need to either pick specific skills to bring in, or explicitly choose to bring in all of them — they should never end up with only some skills imported without knowing others were available.

**Why this priority**: Multi-skill sources are a common, expected case (teams often publish a collection together); without this, the feature would silently under-deliver for any source beyond the simplest case.

**Independent Test**: Can be fully tested by pointing the import tool at a repository with multiple valid skills and verifying the user is presented with the full set to choose from, or must explicitly opt in to importing all of them.

**Acceptance Scenarios**:

1. **Given** a source containing three valid skills, **When** the user imports without specifying which ones, **Then** they are shown all three and asked which to import.
2. **Given** a source containing three valid skills, **When** the user explicitly requests importing all of them, **Then** all three are created as new skills in one operation.
3. **Given** a source containing three valid skills where one has invalid/malformed content, **When** the user imports, **Then** the two valid skills are available to import and the invalid one is clearly flagged rather than silently skipped or silently failing the whole operation.

---

### User Story 3 - See where an imported skill came from (Priority: P3)

After importing a skill, a user (or a teammate later) looks at that skill in the product and can see it was brought in from an external source, and which one — so nobody has to guess whether a skill was authored locally or pulled in from somewhere else.

**Why this priority**: Provenance is what keeps imported content trustworthy and auditable over time, but it's a secondary concern to actually getting the import to work.

**Independent Test**: Can be fully tested by importing a skill and then viewing that skill's details, confirming the original source is shown.

**Acceptance Scenarios**:

1. **Given** a skill that was imported from an external source, **When** a user views that skill's details, **Then** the source it came from is visible.
2. **Given** a skill that was authored directly in the organization (not imported), **When** a user views its details, **Then** no external source is shown.

---

### Edge Cases

- What happens when the source repository is private, deleted, or otherwise unreachable at import time? System must distinguish this from "no skill content found" with a clear, separate message.
- What happens when a skill's name collides with one that already exists in the target organization? Import of that specific skill is rejected with a clear, actionable error — never a silent overwrite and never a mangled duplicate name.
- What happens when a user re-runs an import against a source they already imported previously? Treated the same as any other name collision (see above) — there is no dedicated update/re-sync behavior in this feature.
- What happens when imported content exceeds the size or file-count limits already enforced for any skill in the system? The import of that skill is rejected with a clear error identifying which limit was exceeded; it is not silently truncated or partially imported.
- What happens when the source's skill metadata is malformed or missing required fields (e.g. no name)? That skill is flagged as invalid and excluded from what can be imported, without failing unrelated valid skills from the same source.
- What happens when the caller has no organization membership or is not authenticated? Import is rejected before any fetch or creation occurs.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST accept a GitHub repository location (a full URL or an `owner/repo`-style shorthand) identifying an external source that may publish one or more skills.
- **FR-002**: System MUST read skill content from the source in the same file-bundle shape used for skills authored directly in the system (required instructions content plus zero or more named supporting files) — a direct mapping, not a format conversion.
- **FR-003**: When a source contains exactly one valid skill, system MUST import it without requiring an additional selection step from the user.
- **FR-004**: When a source contains more than one valid skill, system MUST either let the user select which ones to import, or import all of them under an explicit, deliberate opt-in — the user must never be left unaware that more than one skill was available.
- **FR-005**: Each imported skill MUST be created under the invoking user's own ownership within their own organization, using the exact same creation path used for any other skill in the system — no separate or privileged path for imported content.
- **FR-006**: System MUST NOT require the invoking user to own or have write access to the external source — read access to publicly-published content is sufficient.
- **FR-007**: System MUST reject importing a skill whose name already exists in the target organization, with a clear, actionable error identifying the conflicting name. It MUST NOT silently overwrite the existing skill or create a duplicate under an auto-mangled name.
- **FR-008**: System MUST record, for each imported skill, where it came from (the source location/identifier) in a way that persists after the import completes.
- **FR-009**: System MUST make an imported skill's origin visible to users within the product (e.g. alongside the skill's other details) — provenance information must not be discarded or left accessible only in a log.
- **FR-010**: System MUST apply the same content-size and supporting-file-count limits used when any skill is created in the system, rejecting an import that violates them with a clear error rather than importing partial or truncated content.
- **FR-011**: System MUST reject an import attempt when no valid skill content can be found at the given source, with a message distinguishing "nothing found" from a source-access failure.
- **FR-012**: System MUST reject an import attempt when the source is unreachable (private, deleted, network failure, etc.), with a clear error distinct from "nothing found."
- **FR-013**: System MUST support GitHub repositories as the external source type for this feature; other named public skill registries are out of scope until a future integration is added.

### Key Entities *(include if feature involves data)*

- **External Skill Source**: A GitHub repository (optionally a specific path within it) that publishes one or more skills in the standard skill-file shape, identified by a URL or `owner/repo` shorthand. Not owned or controlled by the importing organization.
- **Imported Skill**: A skill created in the organization's registry as the result of an import. Identical in every respect (ownership, versioning, visibility, governance) to any other skill in the system, except that it carries an attached provenance record.
- **Skill Provenance**: Information recording where a specific skill originated — its external source location and that it was brought in via import (as opposed to authored directly) — visible on that skill going forward.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can bring a publicly-published external skill into their own organization's registry in a single action, without manually retyping or recreating any of its content.
- **SC-002**: 100% of imports from a source containing exactly one valid skill complete without requiring any extra selection step.
- **SC-003**: When a source publishes multiple skills, 100% of import attempts either show the user the full available set or require an explicit all-skills opt-in — never an unindicated partial import.
- **SC-004**: 100% of import attempts using a name that already exists in the target organization fail with a clear error and zero silent overwrites or mangled-name duplicates.
- **SC-005**: For any imported skill, a user can determine where it originally came from at any time afterward, without consulting anyone or anything outside the product itself.

## Assumptions

- GitHub repositories are the only external source type supported in this feature; no other named public skill registry currently exists to integrate with, so that is deferred to a future feature per the epic's own framing.
- Re-importing a source that was already imported previously is not given any special "update" or "re-sync" treatment — it is rejected the same way any other name collision would be, since a differentiated retry/update mechanic is out of scope for this feature.
- Provenance tracking covers "where did this skill come from," not a full history of every fetch/import attempt against a source over time — one durable record per imported skill is sufficient.
- Only publicly accessible repositories are supported; sources requiring the importing user to supply their own access credentials (e.g. a private repository) are out of scope for this feature.
- The multi-skill-source detection convention (e.g. a directory containing one subfolder per skill) follows the common layout already used by real skill-publishing repositories, matching this product's own skill-file-bundle shape.
- The invoking user is already an authenticated, organization-scoped user of the product; this feature extends an existing tool surface rather than introducing a new account/access model.
- This feature depends on skills already being representable as a file bundle (instructions plus named supporting files) rather than a single opaque template string — that representation is assumed to already exist by the time this feature is built.
