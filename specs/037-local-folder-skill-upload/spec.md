# Feature Specification: Local Folder Skill Upload

**Feature Branch**: `[037-local-folder-skill-upload]`

**Created**: 2026-08-10

**Status**: Draft

**Input**: User description: "/Users/ben/repos/SpecHub/backlog/013-skill-import-and-external-registries/002-existing-repo-skill-upload.md"

## Clarifications

### Session 2026-08-10

- Q: When the user selects a local folder, what should the browser actually upload to the server for scanning? → A: Only matched skill folders — the client walks the selected folder tree, identifies candidate skill folders first, and uploads only those, never unrelated content sitting alongside them.
- Q: If the same skill name is detected twice within one upload batch, what should happen? → A: Flag both, let user pick — both conflicting candidates are shown in the preview, visibly flagged, and the user may select at most one of the pair.
- Q: Should there be an explicit cap on how many skills can be registered in a single bulk-upload batch? → A: No cap — batch size is bounded only by limits already inherent to the system elsewhere, not a new product-level cap.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Bulk-register skills already sitting in a local folder (Priority: P1)

A user already has a folder of skills on their own machine (for example, a repo's `.claude/skills/` directory, or any folder containing one or more skill subfolders) and wants to bring them into their organization's skill registry without hand-recreating each one through the product's normal single-skill creation flow. They pick the folder from their browser, see exactly which skills were detected, and register them in one action.

**Why this priority**: This is the entire value of the feature — turning a folder of skills already on disk into registered skills with one bulk action instead of many manual ones. Without this, the feature delivers nothing.

**Independent Test**: Can be fully tested by selecting a local folder containing three real skill subfolders and verifying three new, correctly-owned skills appear in the organization's registry with matching content.

**Acceptance Scenarios**:

1. **Given** a local folder containing three valid skill folders, **When** the user selects that folder and confirms, **Then** three new skills are created in their organization, owned by them, with instructions and supporting files matching the source folders.
2. **Given** a local folder with no recognizable skill content inside, **When** the user selects it, **Then** the tool clearly reports that no skills were found and creates nothing.
3. **Given** the user is not signed in, **When** they attempt to use this feature, **Then** they are required to sign in before anything is scanned or uploaded.

---

### User Story 2 - Review and choose which detected skills to register (Priority: P2)

Before anything is created, the user sees the full list of skills the tool detected in the selected folder and can decide which ones to actually register — nothing is bulk-created silently or without their explicit confirmation.

**Why this priority**: A silent bulk-create against a folder the user only partially wants to register in this system would be surprising and hard to undo; requiring a clear preview and explicit confirmation makes the bulk action safe by default. Secondary to the core upload happening at all.

**Independent Test**: Can be fully tested by selecting a folder with multiple detected skills and verifying the user sees the full set before any are created, and that unchecked ones are not created.

**Acceptance Scenarios**:

1. **Given** a folder containing three valid skills, **When** the user selects the folder, **Then** all three are shown in a preview before any creation happens.
2. **Given** a preview showing three detected skills, **When** the user deselects one and confirms, **Then** only the two selected skills are created.
3. **Given** a folder containing three valid skills where one has malformed content, **When** the user reviews the preview, **Then** the two valid skills are available to select and the invalid one is clearly flagged rather than silently omitted or silently failing the whole operation.
4. **Given** two detected candidates share the same name within the same upload batch, **When** the user reviews the preview, **Then** both are shown clearly flagged as conflicting with each other and the user may select at most one of the pair.

---

### User Story 3 - Fail clearly on a name collision without losing the rest of the batch (Priority: P3)

When one of the skills in a batch has the same name as a skill that already exists in the organization, the user needs that specific skill's registration to fail with a clear reason, while every other skill in the same batch still succeeds.

**Why this priority**: Protects against silent overwrites or confusing all-or-nothing failures, but only matters once the core bulk-upload flow (P1) and preview/selection (P2) already work.

**Independent Test**: Can be fully tested by selecting a folder containing one skill whose name already exists in the organization alongside two skills with unique names, confirming the batch, and verifying the two unique skills are created while the colliding one fails with a clear message.

**Acceptance Scenarios**:

1. **Given** a batch of three skills where one name already exists in the organization, **When** the user confirms the batch, **Then** the two non-colliding skills are created and the colliding one fails with a clear, actionable error naming the conflict.
2. **Given** a name collision failure, **When** the user views the result, **Then** nothing was silently overwritten and no duplicate was created under a mangled name.

---

### Edge Cases

- What happens when the selected folder itself is a single skill (a `SKILL.md` at the top level) rather than a container of multiple skill subfolders? It is detected and offered the same as any other valid skill.
- What happens when the selected folder nests skills under a container path (e.g. `.claude/skills/*/` or `.agents/skills/*/`) alongside unrelated files and folders? Only real skill folders are detected; unrelated content is ignored, not flagged as an error.
- What happens when the uploaded content exceeds the size or file-count limits already enforced for any skill in the system? That specific skill's registration is rejected with a clear error identifying which limit was exceeded; it is not silently truncated or partially created.
- What happens when a skill's metadata is malformed or missing required fields (e.g. no name)? That skill is flagged as invalid and excluded from what can be selected, without affecting unrelated valid skills detected in the same folder.
- What happens if the user's browser or device does not support selecting a whole folder at once? The tool clearly indicates folder selection is unavailable rather than silently accepting an incomplete selection.
- What happens when the same folder is uploaded a second time after the skills from the first upload already exist? Each skill hits the same name-collision handling as any other duplicate name — there is no dedicated update/re-sync behavior in this feature.
- What happens when the selected folder contains large amounts of content unrelated to any skill (e.g. the user selects an entire repo checkout that happens to contain `.claude/skills/`)? Only files belonging to detected candidate skill folders are transmitted for scanning; unrelated content elsewhere in the tree is never uploaded.
- What happens when two detected candidates in the same batch share the same name? Both are flagged as conflicting with each other in the preview, and the user may select at most one of them — this is distinct from a collision against an already-existing organization skill (see FR-006), which is checked separately at registration time.
- What happens when a folder contains an unusually large number of detected skills (e.g. hundreds)? There is no fixed product-level cap on batch size; the preview and registration must handle whatever number of valid candidates are actually detected.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST let an authenticated user select a folder from their own local device (not a remote URL) as the source for a bulk skill-registration action.
- **FR-002**: System MUST scan the selected folder's contents for skill content in the same file-bundle shape used for skills authored directly in the system (required instructions content plus zero or more named supporting files), whether the selected folder itself is a single skill or a container of multiple skill subfolders (including nested container paths).
- **FR-003**: System MUST present the user with the full set of detected skills, before creating anything, so they can choose which ones to register.
- **FR-004**: System MUST NOT create any skill until the user has explicitly confirmed the selection — no automatic creation on folder selection alone.
- **FR-005**: Each registered skill MUST be created under the invoking user's own ownership within their own organization, using the exact same creation path used for any other skill in the system — no separate or privileged path for uploaded content.
- **FR-006**: System MUST reject registering a skill whose name already exists in the target organization, with a clear, actionable error identifying the conflicting name. It MUST NOT silently overwrite the existing skill or create a duplicate under an auto-mangled name.
- **FR-007**: When a batch includes one skill that fails (e.g. a name collision or a content-limit violation), system MUST still complete registration of every other unaffected skill in the same batch rather than aborting the whole batch.
- **FR-008**: System MUST apply the same content-size and supporting-file-count limits used when any skill is created in the system, rejecting a skill that violates them with a clear error rather than registering partial or truncated content.
- **FR-009**: System MUST require the user to be signed in before scanning or uploading any folder contents — no anonymous use of this feature.
- **FR-010**: System MUST flag any detected folder with malformed or missing required skill metadata (e.g. no name) as invalid and exclude it from what can be selected, without affecting unrelated valid skills detected in the same folder.
- **FR-011**: System MUST clearly report when a selected folder contains no recognizable skill content, without creating anything.
- **FR-012**: System MUST transmit only the files belonging to detected candidate skill folders for server-side scanning — it MUST NOT upload the full contents of the selected folder tree, including any unrelated files or folders sitting alongside detected candidates.
- **FR-013**: System MUST detect when two or more candidates within the same batch share the same name, visibly flag them as conflicting with each other in the preview, and allow the user to select at most one of the conflicting candidates for registration.
- **FR-014**: System MUST NOT impose a fixed maximum on the number of skills that can be previewed or registered in a single batch beyond limits already inherent to the system elsewhere (e.g. per-skill content/file-count limits).
- **FR-015**: System MUST clearly indicate when the caller's browser or device does not support selecting a whole local folder, rather than silently accepting an incomplete selection.

### Key Entities *(include if feature involves data)*

- **Uploaded Skill Folder**: A folder selected from the user's local device, containing one or more skill-shaped subfolders (or being itself a single skill), scanned client-side/uploaded for server-side detection. Not owned or controlled by any remote source — entirely local to the user's device until upload.
- **Registered Skill**: A skill created in the organization's registry as the result of this bulk action. Identical in every respect (ownership, versioning, visibility, governance) to any other skill in the system — this feature carries no special ownership or provenance model beyond normal skill creation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can register every skill already sitting in a local folder into their organization's registry in a single bulk action, without manually retyping or recreating any of its content.
- **SC-002**: 100% of bulk-registration attempts show the user the full set of detected skills and require explicit confirmation before any skill is created — never a silent or automatic bulk-create.
- **SC-003**: 100% of registration attempts using a name that already exists in the target organization fail with a clear error and zero silent overwrites or mangled-name duplicates, while unaffected skills in the same batch still succeed.
- **SC-004**: A folder containing zero recognizable skills produces a clear "nothing found" result with zero skills created, every time.
- **SC-005**: 100% of uploads transmit only the content of detected candidate skill folders — a user selecting a folder containing large amounts of unrelated content never has that unrelated content leave their device.

## Assumptions

- The invoking user is already an authenticated, organization-scoped user of the product; this feature extends an existing tool surface rather than introducing a new account/access model.
- "Local folder" means content selected directly from the user's own device via their browser (folder picker or drag-and-drop) — not a path on a remote server, and not a git URL (that direction is covered by the separate external-registry-import feature).
- The same skill-folder-detection conventions used elsewhere in this product (a `SKILL.md`-shaped folder, whether standalone or nested under a container path such as `.claude/skills/*/` or `.agents/skills/*/`) apply here, since this feature reads the same file-bundle shape skills are already represented in.
- Re-registering a folder whose skills were already registered in a previous upload is not given any special "update" or "re-sync" treatment — it is rejected the same way any other name collision would be, since a differentiated retry/update mechanic is out of scope for this feature.
- After registration, the locally-uploaded folder and the registered skills are independent copies going forward; no ongoing link or sync is established between the user's local files and the registered skills by this feature.
- This feature depends on skills already being representable as a file bundle (instructions plus named supporting files) rather than a single opaque template string — that representation is assumed to already exist by the time this feature is built.
- Browser folder-selection support (e.g. a directory-aware file picker or drag-and-drop of a folder) is assumed to be available in the target user's browser; a device/browser without any such capability is treated as an edge case with a clear "unavailable" message, not a hard blocking requirement to work around.
