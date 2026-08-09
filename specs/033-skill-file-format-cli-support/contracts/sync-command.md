# Contract: `skillcanon sync`

## REST calls made (no backend changes — both routes already exist)

1. `GET /api/skills?projectId=<linked-project-id>` — roster. Response items now read `activeVersionId` in addition to today's `name`/`description` (field already present server-side, just newly consumed). `kind` is **not** a roster-item field — corrected during T030 manual validation; it only exists per-version.
2. Per roster entry with `activeVersionId !== null`: `GET /api/skills/[name]/versions` — full version list; client finds the entry matching `activeVersionId` and reads `.kind`/`.files` from that version.

No request body changes on either call. No new REST route, no new query param.

## Local file-system effect, per skill

| Skill shape | `SKILL.md` content | Supporting files |
|---|---|---|
| New-shape template (`kind: "template"`, `files.length > 0`) | The active version's main-file (`SKILL.md`-named) content, verbatim | Every other file in `files`, verbatim, under its authored name |
| Legacy-shape template (`kind: "template"`, `files.length === 0`) | Unchanged pointer stub: `Run \`skillcanon run <slug>\` and follow the output as instructions.` | None |
| Chain (`kind: "chain"`) | Unchanged pointer stub (same as legacy-shape) | None |

Frontmatter (`name`/`description`) is written identically across all three shapes — unchanged from today.

## `sync-manifest.json`

**Before**:
```json
{ "stubs": { "release-notes": "a1b2c3..." } }
```

**After**:
```json
{ "stubs": { "release-notes": { "SKILL.md": "a1b2c3...", "example.md": "d4e5f6..." } } }
```

An old-format entry (string value instead of object) is read as if absent for that slug.

## `SyncResult` (CLI-internal, returned by `runSync()`)

Unchanged shape (`{ created, updated, removed, conflicts }`), but each array element is now `{ slug, filename }` instead of a bare slug string, since conflicts/creates/updates/removals are per-file. Stdout/stderr messaging (`registerSyncCommand`'s conflict-reporting loop) updates to name the specific file, not just the skill:

**Before**: `Skipped "release-notes": hand-edited. Run with --force to overwrite a hand-edited stub.`
**After**: `Skipped "release-notes/example.md": hand-edited. Run with --force to overwrite a hand-edited file.`

## `skillcanon run <slug>` — unchanged

No contract change. Still `POST /api/skills/[name]/expand` with no `input` field, still resolves live on every call, still never reads a synced local file.
