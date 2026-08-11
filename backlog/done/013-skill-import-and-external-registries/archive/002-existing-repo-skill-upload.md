---
epic: 013-skill-import-and-external-registries
feature: 002-existing-repo-skill-upload
status: done
dependencies: ["backlog/006-prompt-registry/011-skill-file-format-refactor.md", "backlog/008-distribution/007-skill-file-format-cli-support.md"]
---

# Local Folder Skill Upload

A web UI workflow (distinct from `001-external-skill-registry-import.md`'s "Import from link" drawer mode) for onboarding SkillCanon into skills you already have sitting on disk: pick a local folder from the browser's own file picker (or drag-and-drop it), scan the uploaded contents for skill folders (a `SKILL.md` + optional reference/template files, whether the folder itself is a skill root, or a container like `.claude/skills/`/`.agents/skills/` with one subfolder per skill), and register the ones the caller selects into SkillCanon in bulk — so a team adopting SkillCanon on an existing, already-skill-equipped codebase doesn't have to hand-recreate every skill through the UI or API one at a time. No CLI command, no repo/project linkage — this is a signed-in web UI upload, same authentication as any other authenticated action in the app.

**Status note (037-local-folder-skill-upload, 2026-08-11):** Fully built and verified live against the shared dev stack. Detection uses one general rule (any `SKILL.md`, its parent directory is a candidate) rather than hardcoded container paths, so it covers `.claude/skills/*/`, `.agents/skills/*/`, a bare selected skill folder, and any other convention uniformly. No dedicated "upload endpoint" was built — detection and creation are Next.js Server Actions (`scanLocalSkillFoldersAction`/`importLocalSkillsAction` in `src/app/(app)/prompts/actions.ts`), matching this app's established pattern for the sibling `001` feature and every other prompts mutation, not a REST route.

## Requirements

- [x] A new mode on the existing New Skill drawer (alongside `001`'s already-shipped "Import from link" mode) — "Import from folder" — that lets the signed-in caller pick a local folder via the browser's folder picker (`<input type="file" webkitdirectory>` or equivalent) or drag-and-drop. Built: `src/app/(app)/prompts/new-prompt-drawer.tsx`'s third mode.
- [x] Client uploads the selected folder's files to a new endpoint that scans them for real skill folders: a `SKILL.md` (frontmatter + body) plus any co-located reference/template files, at the folder root, one level down (e.g. a `skills/` container), or nested under `.claude/skills/*/`/`.agents/skills/*/`. Built: `src/bcs/prompt-registry/domain/local-skill-source.ts`'s `scanLocalSkillFolders()`, called from `scanLocalSkillFoldersAction` — the client only reads/transmits files inside an already-detected candidate directory (`src/app/(app)/prompts/local-folder-reader.ts`), never the full folder tree.
- [x] Presents the detected skill set to the caller before creating anything (same preview + per-skill checkbox selection pattern `001` already uses) — no silent bulk-create. Built, plus two behaviors beyond `001`'s original scope, added during `/speckit-clarify`: malformed folders (empty/oversized `SKILL.md`) are excluded and flagged with a reason, and intra-batch same-name candidates are flagged with at most one selectable at a time.
- [x] Each uploaded skill is created via the existing `createPrompt`/`publishVersion` API, owned by the invoking user, same as `001-external-skill-registry-import.md`'s creation path — no special-cased ownership model. Built: `runLocalSkillImportBatch` in `actions.ts`.
- [x] Name collision handling identical to `001`'s: a skill whose name already exists in the target org fails clearly, no silent overwrite. Built — and unlike `001`'s client-side pre-block (which disables its confirm button on any collision), this mode's confirm button deliberately stays enabled through a collision, so the batch still proceeds and the per-skill server-side isolation is reachable through normal use (verified live: 2 of 3 succeed, 1 fails clearly, no auto-close while a failure remains).
- [x] After upload, the local folder's skills and the SkillCanon-registered skills are two independent copies (this is a one-time bulk-create, not an ongoing sync) — no `sourceUrl`/provenance is ever set for a locally-uploaded skill, matching this item's original framing.

## Acceptance Criteria

- [x] Selecting a local folder containing three real skill folders previews all three, and on confirmation creates exactly three correctly-owned, correctly-content-matching skills in SkillCanon. Verified live.
- [x] Selecting a folder with zero skill folders inside reports that clearly in the drawer, does nothing destructive. Verified live ("No skills found in the selected folder.").
- [x] A collision with an existing SkillCanon skill name fails that one skill's upload with a clear error, without aborting or silently skipping the rest of the batch. Verified live.
- [x] The upload endpoint requires the caller to be authenticated (same session/auth guard as `createPrompt` itself) — no anonymous upload path. Both Server Actions call the existing `requireActingUser()` guard; verified an unauthenticated session redirects to `/login` before anything is scanned.

## Open Questions

- ~~Upload mechanism/size limits: does the browser send every selected file individually, or bundle the folder client-side (e.g. a zip) before upload?~~ **Resolved:** neither — the client sends already-read file *contents* (as plain strings) for only the detected candidate-directory files via a Server Action call, not a raw file/blob upload or a client-side zip. See `research.md`'s "what gets read and transmitted" decision.
- Should this also detect and flag skills that look like duplicates of ones already imported via `001-external-skill-registry-import.md` (matching provenance/content), to avoid double-registering the same skill from both directions? Nice-to-have, not required for v1 — still open, not built.

## Dependencies

- `backlog/006-prompt-registry/011-skill-file-format-refactor.md`
- `backlog/008-distribution/007-skill-file-format-cli-support.md`
- `backlog/013-skill-import-and-external-registries/archive/001-external-skill-registry-import.md` (reuses the New Skill drawer + preview/selection UI this established)
- [PDR-018](../../docs/pdr/018-skill-file-format-and-registry-import.md)

## Technical Notes

Keep this genuinely separate from `001-external-skill-registry-import.md`'s source-fetching code path — different source (browser-uploaded local files vs. fetching an external URL server-side) — but reuse as much of its UI shell and skill-folder-parsing logic as possible: both end up with the same "candidate skill folders → caller picks which to import → create via `createPrompt`/`publishVersion`" shape, just fed from a different origin (an uploaded folder vs. a fetched GitHub repo). No CLI surface is required for this item, matching the precedent set by `001` (see its Status note): the web UI path is the caller-facing surface.
