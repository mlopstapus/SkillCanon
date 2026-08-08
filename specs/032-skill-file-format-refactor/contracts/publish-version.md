# Contract: `publishVersion()` / `POST /api/skills/[name]/versions`

## `publishVersion()` (`src/bcs/prompt-registry/application/publish-version.ts`)

**Before** (`PublishVersionParams`):
```ts
{ promptName, organizationId, version, systemTemplate?, userTemplate?, steps?, inputSchema?, tags? }
```

**After**:
```ts
{
  promptName: string;
  organizationId: string;
  version: string;
  mainFile?: { content: string };                       // template-kind, new-shape only
  supportingFiles?: Array<{ name: string; content: string }>; // optional, default []
  steps?: ChainStep[];                                   // chain-kind only, unchanged
  tags?: string[];
}
```

- Exactly one of `mainFile` or `steps` MUST be given (mirrors today's exactly-one-of `systemTemplate`/`userTemplate` vs. `steps` check) — both or neither throws `InvalidVersionShapeError`, unchanged behavior, new field names.
- `mainFile.content` empty, or any file (main or supporting) exceeding 64 KB, or more than 20 `supportingFiles`, or a duplicate `supportingFiles[].name` → throws new `InvalidVersionFilesError` naming the specific violation.
- `inputSchema` param removed entirely — no new version can be published carrying one, for any kind.
- No new version may be published in the legacy `systemTemplate`/`userTemplate` shape — that shape is read-only going forward (FR-011).

## `POST /api/skills/[name]/versions`

**Request body — before** (zod schema):
```ts
{ version, systemTemplate?, userTemplate?, steps?, inputSchema?, tags? }
```

**Request body — after**:
```ts
{
  version: string;
  mainFile?: { content: string };
  supportingFiles?: Array<{ name: string; content: string }>;
  steps?: z.array(chainStepSchema).optional();
  tags?: string[];
}
```

**Response body**: unchanged shape (the created `PromptVersionSummary` row — see data-model.md for its updated fields: `files: PromptVersionFile[]` added, `systemTemplate`/`userTemplate` remain present but null for anything published through this endpoint going forward).

**Response status**: unchanged (`201`).

**New error mapping**: `InvalidVersionFilesError` → `422` with code `INVALID_SKILL_VERSION_FILES`, registered alongside the existing `InvalidVersionShapeError` → `422 INVALID_SKILL_VERSION_SHAPE` entry in `src/shared/api/errors.ts`.
