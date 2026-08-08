# Phase 1 Data Model: Skill File Format Refactor

## Entities

### `prompt_registry.prompt_versions` (existing table, columns removed)

| Column | Change |
|---|---|
| `system_template` | Removed for new inserts. Existing rows keep their value untouched (FR-010) — the column itself stays in the schema (never dropped) since legacy rows still read from it. |
| `user_template` | Same as above. |
| `input_schema` | Dropped entirely — removed from the schema (no legacy row needs it preserved; it was already unvalidated dead weight per PDR-018's Context). |
| `kind` | Unchanged (`"template" \| "chain"`). A version's *legacy vs. new-shape* status is not a column — see below. |

A template-kind version is **new-shape** iff it has an associated `prompt_version_files` row with `is_main = true`; otherwise it is **legacy-shape** and `system_template`/`user_template` are its content (Research §1).

### `prompt_registry.prompt_version_files` (new table)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `prompt_version_id` | uuid, FK → `prompt_versions.id`, `ON DELETE CASCADE` | |
| `name` | text, not null | `"SKILL.md"` for the main file; caller-chosen for supporting files |
| `content` | text, not null | ≤ 64 KB, enforced in `publishVersion` before insert (not a DB constraint) |
| `is_main` | boolean, not null, default `false` | Exactly one `true` row per version (application-enforced) |
| `created_at` | timestamptz, not null, default now() | |

**Constraints**:
- `unique(prompt_version_id, name)` — a version cannot have two files with the same name.
- Application-level (not DB): exactly one `is_main = true` row per version; at most 20 rows total per version (Research §6).

**RLS**: Enabled + forced, policy scoped `TO skillcanon_app`, `USING`/`WITH CHECK` an `EXISTS` join through `prompt_versions` → `prompts.organization_id = current_setting('app.current_org_id')::uuid` — the same two-hop pattern `0019_prompt_registry_rls.sql` already uses for `prompt_versions` itself (which also has no direct `organization_id` column).

**Immutability**: Like `prompt_versions` rows generally, once a version is published its files are never updated or deleted — a new version is the only way to change content (spec Key Entities).

### Domain types (`src/bcs/prompt-registry/domain/prompt.ts`)

```ts
export interface PromptVersionFile {
  id: string;
  name: string;
  content: string;
  isMain: boolean;
}

export interface PromptVersionSummary {
  // ... existing fields unchanged (id, promptId, version, kind, steps, tags, createdAt) ...
  systemTemplate: string | null; // legacy-shape only; null for new-shape and for chain-kind
  userTemplate: string | null;   // legacy-shape only
  files: PromptVersionFile[];    // empty for legacy-shape and chain-kind versions
}

export interface PublishVersionParams {
  promptName: string;
  organizationId: string;
  version: string;
  /** Template-kind, new-shape only. Mutually exclusive with `steps` (PDR-017). */
  mainFile?: { content: string };
  supportingFiles?: Array<{ name: string; content: string }>;
  steps?: ChainStep[];
  tags?: string[];
  // systemTemplate/userTemplate/inputSchema removed — no new version can be
  // published in the legacy shape (FR-011).
}
```

`determinePromptVersionKind` now checks `steps !== undefined` vs. `mainFile !== undefined` (exactly one, same invariant as today, new field names).

### Domain types (`src/bcs/prompt-registry/domain/expansion.ts`)

```ts
export interface ExpandParams {
  organizationId: string;
  promptName: string;
  // `input` removed entirely (FR-002).
  userId?: string;
  projectId?: string;
  version?: string;
}

export interface ExpansionResult {
  content: string; // replaces systemMessage/userMessage (FR-003)
  appliedPolicies: string[];
  objectives: string[];
}
```

### New error

```ts
export class InvalidVersionFilesError extends Error {
  // thrown for: empty main file, oversized file (>64 KB), duplicate
  // supporting-file name, more than 20 supporting files
}
```

## State / Lifecycle

- A skill (`prompts` row) may exist with zero versions (already true today — `createPrompt` never inserts a version; unchanged by this feature).
- A version, once published, is immutable — this already holds for `prompt_versions` and extends unchanged to `prompt_version_files` (no update/delete path exists for a published version's files).
- No migration/backfill runs against existing `prompt_versions` rows — `system_template`/`user_template` values are left exactly as stored (FR-010, FR-011). No `prompt_version_files` rows are ever backfilled for them.

## Relationships

```
prompts (1) ──< prompt_versions (many) ──< prompt_version_files (many, template-kind only)
```

No new relationship to any other bounded context — `prompt_version_files` is wholly owned by `prompt-registry`, same as `prompt_versions`.
