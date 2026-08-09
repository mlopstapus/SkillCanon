# Feature Specification: Skill File Format CLI Support

**Feature Branch**: `033-skill-file-format-cli-support`

**Created**: 2026-08-08

**Status**: Draft

**Input**: User description: "`/Users/ben/repos/SpecHub/backlog/008-distribution/007-skill-file-format-cli-support.md` — per PDR-018, rework `skillcanon sync`'s stub-generation to sync a skill's real markdown content plus its supporting files into a real `.claude/skills/<slug>/` folder, replacing the current fixed one-line pointer stub. `skillcanon run` still resolves live per-invocation with no `input` argument (per `006-prompt-registry/011-skill-file-format-refactor.md`, shipped as `032-skill-file-format-refactor`) — this feature is about local authoring/readability, not caching invocation results."

## Clarifications

### Session 2026-08-08

- Q: For a skill with no real file bundle to sync (a chain-kind workflow, or a template-kind skill still in the pre-`032-skill-file-format-refactor` legacy shape), what should `skillcanon sync` write locally? → A: Keep today's one-line pointer stub for these two cases only — no regression, no skill silently disappearing from the local folder. New-shape skills get real synced content.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See a skill's real instructions locally, not a pointer sentence (Priority: P1)

A developer working in a repo linked to SkillCanon runs `skillcanon sync`. For every skill published in the new markdown-plus-files shape, their local `.claude/skills/skillcanon-<slug>/SKILL.md` now contains that skill's actual authored instructions — the same content a teammate sees in the SkillCanon app's Files tab — instead of a generic "run this command" sentence. Any supporting files the skill's author attached (a checklist, an example, a reference template) appear alongside `SKILL.md` in the same folder, under their own authored names.

**Why this priority**: This is the entire reason the feature exists — closing the gap between what the SkillCanon app shows a skill's content to be and what a local Claude Code session actually sees when it reads `.claude/skills/`.

**Independent Test**: Publish a skill with a main file and two supporting files (already possible per `032-skill-file-format-refactor`); run `skillcanon sync` in a linked repo; confirm the local folder contains all three files with matching content.

**Acceptance Scenarios**:

1. **Given** a skill published with real markdown content and one supporting file, **When** `skillcanon sync` runs, **Then** `.claude/skills/skillcanon-<slug>/SKILL.md` contains that skill's actual main-file content (not a pointer sentence), and the supporting file appears alongside it under its authored name.
2. **Given** a skill published with only a main file (no supporting files), **When** `skillcanon sync` runs, **Then** only `SKILL.md` is written — no empty placeholder files.
3. **Given** a skill's content is updated (a new version published and made active), **When** `skillcanon sync` runs again, **Then** the local files are updated to match the new active version's content.

---

### User Story 2 - A hand-edit to any synced file is never silently overwritten (Priority: P1)

A developer notices something worth tweaking in a synced skill file and edits it locally before realizing that's not how changes are supposed to flow. The next time `skillcanon sync` runs, it notices the file doesn't match what it last wrote, leaves that file alone, and tells the developer clearly instead of silently overwriting their edit or silently keeping a now-stale copy forever.

**Why this priority**: This guarantee already exists for the single-file stub today (`sync-manifest.json`'s hash-based drift detection) — extending it to every file in a multi-file bundle is what keeps `sync` trustworthy to run repeatedly and automatically (it already runs on every Claude Code session start).

**Independent Test**: Hand-edit one file inside a synced skill's folder (leaving the others untouched); run `skillcanon sync`; confirm only the hand-edited file is flagged and skipped, the rest of that skill's files still update normally, and `--force` overwrites the hand-edited one when explicitly passed.

**Acceptance Scenarios**:

1. **Given** a synced skill with two files, **When** one file is hand-edited and `sync` runs again, **Then** that file is left untouched and reported as skipped, while the other (unedited) file still updates normally if the server-side content changed.
2. **Given** a hand-edited file was skipped, **When** `sync --force` runs, **Then** that file is overwritten with the server's current content.
3. **Given** a synced file is deleted (not edited) from disk, **When** `sync` runs, **Then** it is simply recreated — a missing file is never treated as a conflict.

---

### User Story 3 - A skill with no real content to sync still behaves sensibly (Priority: P2)

A repo's skill roster includes a multi-step workflow (chain-kind) and an older skill nobody has re-published since the file-format refactor shipped. `skillcanon sync` doesn't crash or produce a broken/empty folder for either — it keeps writing the same pointer-style stub these two cases have always gotten, so `skillcanon run <slug>` (which resolves everything live regardless) is still the reliable way to actually invoke them.

**Why this priority**: Without this, `sync` either crashes partway through a roster containing any such skill, or leaves a confusing empty/malformed folder — a real regression for every repo with even one workflow or not-yet-republished skill in its roster.

**Independent Test**: Include one chain-kind skill and one legacy-shape (pre-refactor) skill in the synced roster; run `sync`; confirm both get the existing one-line pointer stub, unchanged from current behavior, and every other new-shape skill in the same roster still gets real content.

**Acceptance Scenarios**:

1. **Given** a chain-kind skill in the roster, **When** `sync` runs, **Then** its local file is the existing pointer stub, exactly as it is today.
2. **Given** a template-kind skill whose active version predates the file-format refactor (no file bundle), **When** `sync` runs, **Then** its local file is the existing pointer stub, exactly as it is today.
3. **Given** a mixed roster (some new-shape, some chain-kind, some legacy-shape), **When** `sync` runs, **Then** each skill gets the correct treatment independently — one skill's shape never affects another's.

---

### Edge Cases

- What happens when a skill's active version is switched from new-shape to a different new-shape version with a different supporting-file *set* (a file removed, a file added)? A file no longer present in the new active version must be removed from the local folder, not left behind as an orphan.
- What happens when two supporting files in the same skill's bundle would collide with `SKILL.md`'s own filename (e.g. a supporting file literally named `SKILL.md`)? The server already prevents this at publish time (the main file's name is fixed and reserved); sync can trust that invariant rather than re-validating it.
- What happens when `sync` runs with no server connectivity partway through a multi-skill roster? Existing partial-failure behavior (per-skill try/catch, `--quiet` mode for the automatic SessionStart hook) is unchanged — this feature does not need to introduce new failure-isolation behavior beyond what already exists, just apply it per-file instead of per-skill where relevant.
- What happens to an already-synced skill that switches shape (e.g. someone finally re-publishes a legacy-shape skill in the new shape)? It transitions from a pointer stub to real content on the next `sync`, following the same create/update logic as any other content change — not treated as a special case.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `skillcanon sync` MUST write a skill's real main-file content into `.claude/skills/skillcanon-<slug>/SKILL.md` for every skill whose active version was published in the new markdown-plus-files shape — the file's frontmatter (`name`/`description`) is unchanged from today; only the body changes from a fixed pointer sentence to the skill's actual authored content.
- **FR-002**: `skillcanon sync` MUST write every supporting file attached to that active version into the same `.claude/skills/skillcanon-<slug>/` folder, under the name the skill's author gave it.
- **FR-003**: A skill whose active version has no file bundle (chain-kind, or template-kind still in the pre-refactor legacy shape) MUST continue to get exactly today's one-line pointer stub — no change to this feature.
- **FR-004**: Drift detection MUST extend to every file in a synced skill's folder, not just one — each file is tracked independently: a hand-edited file is skipped and reported; an untouched file whose server-side content changed still updates normally; a missing (deleted, not edited) file is recreated, never treated as a conflict.
- **FR-005**: `sync --force` MUST overwrite every hand-edited file it would otherwise have skipped, matching the existing single-file `--force` behavior extended to the multi-file case.
- **FR-006**: When a skill's active version changes to one with a different supporting-file set, `sync` MUST remove any locally-synced supporting file that's no longer part of the new active version's bundle — no orphaned files left behind.
- **FR-007**: `skillcanon run <slug>` MUST continue to resolve live via the server on every invocation, with no local caching of any kind — the files this feature syncs are for a human/model to read directly for authoring/readability, never a source `run` reads from (per PDR-010's governance-freshness guarantee, unchanged by this feature).
- **FR-008**: The `CLAUDE.md`/`AGENTS.md` blurb this CLI's `init` command already inserts MUST be updated to describe the new real-file-sync behavior, not the old "opaque pointer" framing.
- **FR-009**: A slug-collision (two roster skills deriving the same local folder name) MUST continue to be flagged as a conflict and neither skill's folder written, unchanged from today's single-file behavior.

### Key Entities *(include if feature involves data)*

- **Synced Skill Folder**: `.claude/skills/skillcanon-<slug>/`, containing one required `SKILL.md` (frontmatter + either real main-file content or the pointer stub) plus zero or more supporting files, for a new-shape skill.
- **Sync Record**: Per-file (not per-skill) tracking of the content hash the CLI itself last wrote, used to distinguish a hand-edit from a server-side content change. Extends today's one-hash-per-skill shape to one-hash-per-file.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After running `skillcanon sync`, every new-shape skill's local `SKILL.md` content is byte-for-byte identical to that skill's main-file content as shown in the SkillCanon app.
- **SC-002**: A developer can hand-edit any one file in a synced multi-file skill folder and have that specific edit survive at least one subsequent `sync` run without being overwritten, while every other file in the same folder (and every other skill) still updates normally.
- **SC-003**: 100% of chain-kind and legacy-shape skills in a roster sync without error, using the same pointer-stub behavior that exists today.
- **SC-004**: `skillcanon run <slug>` continues to reflect a policy/objective change made on the server on the very next invocation, with zero code path reading from a synced local file.

## Assumptions

- **Fetching a skill's active-version content**: `skillcanon sync`'s existing roster call (`GET /api/skills?projectId=...`) returns only `{name, description}` per skill today — it does not include a skill's `activeVersionId` or file content. This feature adds a second call per new-shape roster entry (`GET /api/skills/[name]/versions`, already exists, returns every version including `files`) and filters client-side for the one matching the prompt's `activeVersionId`, rather than adding a new backend endpoint — the simplest option that needs zero backend changes. Confirmed during planning if roster size makes this a real latency concern.
- **`sync-manifest.json` schema migration**: the manifest's shape changes from `{ stubs: Record<slug, hash> }` (one hash per skill) to a per-file shape (e.g. `{ stubs: Record<slug, Record<filename, hash>> }`). An old-format manifest from before this feature is treated as "nothing tracked yet" on first run after upgrading — every already-synced skill is re-evaluated fresh (its single old stub file will either match, in the legacy/chain pointer-stub case, or be recognized as needing to expand into the new multi-file shape). This is a one-time, self-healing transition, not a hard migration step the user has to run manually.
- **Terminology**: internal naming (`stub.ts`, `renderStub`, "Skill Stub" in existing docs) reflected the old fixed-pointer-body model. This feature is free to rename these to something like `skill-files.ts`/`renderSkillFile` during implementation for clarity, since "stub" is no longer accurate for a new-shape skill's real content — exact naming decided during planning, not user-facing.
- **`skillcanon run`'s own `--input` flag and response shape**: already updated to match `expand()`'s new no-input, single-`content` contract as part of `032-skill-file-format-refactor` landing (confirmed in that feature's own scope-discovery notes) — no further change needed here.
- **Registry-import features** (`013-skill-import-and-external-registries`, Track B item 3) remain explicitly out of scope — they're blocked on this feature landing, not the other way around.
