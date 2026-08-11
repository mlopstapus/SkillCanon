# Data Model: Local Folder Skill Upload

No new database table or column is introduced by this feature. Every registered skill is created through the existing `createPrompt`/`publishVersion` pair against the existing `prompt_registry.prompts`/`prompt_registry.prompt_versions` tables — identical schema, identical RLS/tenant-isolation posture, identical audit-event writes. This feature is entirely new application/domain/UI logic sitting in front of that already-existing write path.

## In-memory entities (no persistence of their own)

### `LocalSkillFileEntry`

One file read from the user's local folder selection, already narrowed to files inside a candidate skill directory (per FR-012 — nothing outside a candidate directory is ever represented at this layer).

| Field | Type | Notes |
|---|---|---|
| `relativePath` | `string` | Path relative to the selected root folder, forward-slash separated (e.g. `.claude/skills/git-commit/SKILL.md`). |
| `content` | `string` | Full text content of the file. |

### `LocalSkillCandidate`

One detected skill folder, ready to hand to `createPrompt`/`publishVersion` — structurally the same shape as the sibling `001` feature's `ExternalSkillCandidate`, but intentionally a separate type (per the backlog's "keep genuinely separate" instruction) since this feature carries no source-URL/provenance concept.

| Field | Type | Notes |
|---|---|---|
| `name` | `string` | From `SKILL.md` frontmatter `name:`, else the containing directory's name (mirrors `parseSkillFrontmatter`'s existing fallback rule). |
| `description` | `string` | From frontmatter `description:`, else the first non-empty/non-heading body line, else `""`. |
| `mainFile` | `{ name: "SKILL.md"; content: string }` | |
| `supportingFiles` | `Array<{ name: string; content: string }>` | Every other file directly inside the candidate directory (non-recursive), each already validated against `MAX_FILE_SIZE_BYTES`/count against `MAX_SUPPORTING_FILES`. |
| `folderPath` | `string` | The candidate directory's `relativePath`, shown in the preview UI so the user can tell two same-named candidates apart. |

### `LocalSkillScanResult`

Returned by the new domain function `scanLocalSkillFolders()`.

| Field | Type | Notes |
|---|---|---|
| `candidates` | `LocalSkillCandidate[]` | Every valid candidate found, regardless of duplicate-name status. |
| `duplicateNames` | `Set<string>` (serialized as `string[]` across the Server Action boundary) | Names shared by two or more entries in `candidates` — FR-013. |
| `invalidFolders` | `Array<{ folderPath: string; reason: string }>` | Directories that had a `SKILL.md` but failed validation (missing name after fallback, empty/oversized main file, etc.) — FR-010, shown in the preview as excluded/flagged rather than silently dropped. |

No entity in this feature has a lifecycle beyond a single request/response — nothing here is stored between the scan step and the confirm step except in the browser's own component state (matching how `001`'s "Import from link" mode already holds its fetched candidates in React state between fetch and confirm).

## Registered Skill (existing entity, no change)

Created via the pre-existing `createPrompt`/`publishVersion` path (`src/bcs/prompt-registry/domain/prompt.ts` and its `prompts`/`prompt_versions` tables). No new field is written for skills registered by this feature — in particular, `prompts.source_url` (added by `001` for external-import provenance) is left `null`, since this feature has no external-source concept to record.
