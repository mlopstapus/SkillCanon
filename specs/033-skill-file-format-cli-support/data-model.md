# Phase 1 Data Model: Skill File Format CLI Support

No database/schema changes — this feature is entirely within the standalone `cli/` package and its use of already-existing REST responses. "Data model" here means the CLI's own local file-system and in-memory shapes.

## Entities

### `SkillSummary` (`cli/src/http/skillcanon-client.ts`, extended)

```ts
export interface SkillSummary {
  name: string;
  description: string | null;
  activeVersionId: string | null; // NEW — already present in the raw API response, just not read before
}
```

**Correction (found during T030 manual validation against the real server, not assumed at planning time)**: `kind` does **not** exist on the roster item / `prompts` table row — it's a per-version field (`prompt_versions.kind`) only, since different versions of the same skill can have different kinds. `resolveSkillContent` reads `kind` off the matched entry in `getSkillVersions()`'s response instead, which does carry it correctly. `SkillSummary` never gained a `kind` field.

### `SkillContent` (new, resolved per roster entry during `sync`)

```ts
export type SkillContent =
  | { shape: "files"; mainFile: { content: string }; supportingFiles: Array<{ name: string; content: string }> }
  | { shape: "pointer-stub" }; // chain-kind, or template-kind with an empty files array (legacy-shape)
```

Resolved by fetching `GET /api/skills/[name]/versions`, finding the entry whose `id === activeVersionId`, and branching on `kind`/`files.length` per research.md §6. A skill with `activeVersionId: null` (never published) is skipped from sync entirely — same as today (a roster only ever contains skills with at least one published version, so this is a defensive branch, not an expected case).

### `SyncManifest` (`cli/src/config/sync-manifest.ts`, schema change)

```ts
// Before
export interface SyncManifest {
  stubs: Record<string, string>; // slug -> single file hash
}

// After
export interface SyncManifest {
  stubs: Record<string, Record<string, string>>; // slug -> filename -> hash
}
```

An entry under an old-format manifest (`typeof manifest.stubs[slug] === "string"`) is treated as absent (research.md §2).

### `ReconcileAction` (`cli/src/skills/reconcile.ts`, granularity change)

```ts
// Before: one action per skill
export type ReconcileAction =
  | { type: "create" | "update"; slug: string; name: string; description: string }
  | { type: "remove"; slug: string }
  | { type: "conflict"; slug: string; reason: "hand-edited" | "slug-collision" };

// After: one action per (skill, file) pair, plus the unchanged whole-skill slug-collision case
export type ReconcileAction =
  | { type: "create" | "update"; slug: string; filename: string; content: string; frontmatter?: { name: string; description: string } }
  | { type: "remove"; slug: string; filename: string }
  | { type: "conflict"; slug: string; filename: string; reason: "hand-edited" }
  | { type: "conflict"; slug: string; reason: "slug-collision" }; // whole-skill, unchanged
```

`frontmatter` is present only for the `SKILL.md` action (the one file carrying YAML frontmatter); supporting files are written as plain content with no frontmatter.

## Relationships

```
roster entry (SkillSummary)
  --activeVersionId--> version (from GET /api/skills/[name]/versions)
    --kind/files--> SkillContent (files | pointer-stub)
      --diffed against SyncManifest.stubs[slug]--> ReconcileAction[] (per file)
        --applied--> .claude/skills/skillcanon-<slug>/<filename> + updated SyncManifest
```

## State / Lifecycle

- A synced file's lifecycle mirrors a skill version's own immutability one level removed: the *file on disk* changes only when the *active version* changes (a new version published and set active, or an explicit rollback) — never mid-version.
- Once a skill's active version moves from legacy-shape/chain to a new-shape template (or vice versa, e.g. rollback to an old version), its local folder transitions between the pointer-stub shape and the real-files shape on the next `sync`, following ordinary create/update/remove logic — not a special-cased transition.
