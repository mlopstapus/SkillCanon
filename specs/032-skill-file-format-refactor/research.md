# Phase 0 Research: Skill File Format Refactor

All items below were resolved by reading the current implementation directly (no external unknowns — this is a refactor of existing, fully-implemented code paths), plus the two decisions already confirmed with the user during `/speckit-specify`/`/speckit-clarify` (migration strategy, legacy-version UI display).

## 1. How a version's "shape" (legacy vs. new) is discriminated

**Decision**: A version is new-shape if and only if it has a row in the new `prompt_version_files` table with `is_main = true`. No new boolean/enum column is added to `prompt_versions`.

**Rationale**: `prompt_versions.kind` (`template`/`chain`, PDR-017) already discriminates template vs. chain. Within `kind = "template"`, legacy vs. new-shape is fully determined by whether a main-file row exists — adding a second discriminant column would let the two signals drift out of sync (e.g. a row claiming "new shape" with zero files). Presence of the required main-file row *is* the invariant; checking it is one extra query already needed to load a version's content at all.

**Alternatives considered**: A `contentFormat: "legacy" | "files"` enum column on `prompt_versions` — rejected as redundant state that has to be kept consistent with the files table instead of being derived from it.

## 2. `expand()`'s new response shape and how legacy versions map onto it

**Decision**: `ExpansionResult` becomes `{ content: string, appliedPolicies: string[], objectives: string[] }` — no more `systemMessage`/`userMessage` split, matching the spec's FR-003. For a **legacy-shape** version, `expand()` internally still runs the existing `applyPolicies`/`renderWithIncludes` system+user pipeline unchanged, then composes the final `content` string as: `systemMessage ? \`${systemMessage}\n\n${userMessage}\` : userMessage`. For a **new-shape** version, policy prepend/append apply directly to the single main-file content (prepend prepends, append appends, inject behaves identically via `templateVars.policies`), then it's rendered as one Nunjucks pass (`env.renderString`) with `include_prompt` resolution exactly as today.

**Rationale**: This keeps every legacy version's actual resolved wording byte-for-byte identical to what it renders today (FR-010) — the join is purely a response-shape composition, not a content change. It avoids inventing a second `expand()` return shape for a boundary case that's expected to shrink to zero over time as owners voluntarily republish.

**Alternatives considered**: Returning `content: null` plus separate legacy-only fields for old-shape versions — rejected because it pushes the branching onto every caller (REST route, MCP tool) instead of resolving it once in `expand()`, and contradicts FR-002/FR-003's flat, single-shape contract.

## 3. `include_prompt(...)` nested-inclusion across mixed shapes

**Decision**: `IncludableVersion` (currently `{ systemTemplate: string | null; userTemplate: string | null }`) becomes a tagged union:
```ts
type IncludableVersion =
  | { kind: "content"; content: string }
  | { kind: "legacy"; systemTemplate: string | null; userTemplate: string | null };
```
`buildIncludePrompt` branches on `.kind`: a `"content"` entry renders the single string and returns it as-is; a `"legacy"` entry keeps its current two-part render-and-join (`[system, user].join("\n\n")`) unchanged. `prefetchIncludedVersions` decides which variant to build per referenced name using the same main-file-row check from Decision 1.

**Rationale**: `include_prompt` must keep working identically for every existing skill regardless of which shape the *including* or the *included* skill is in (FR-008) — this is the minimal change that lets both shapes compose without special-casing at every call site.

**Alternatives considered**: Forcing every included version through the legacy two-field shape (treating new-shape content as `userTemplate` with `systemTemplate: null`) — rejected because it's a lossy, confusing re-interpretation of "no such field exists on new-shape versions" and would resurface the removed system/user distinction by the back door.

## 4. Storage shape for supporting files

**Decision**: A new table, `prompt_registry.prompt_version_files`, one row per file, FK'd to `prompt_versions.id` (`ON DELETE CASCADE`), columns: `id`, `prompt_version_id`, `name` (text), `content` (text), `is_main` (boolean), `created_at`. Unique constraint on `(prompt_version_id, name)`. RLS enabled via the same `EXISTS`-through-parent pattern already used for `prompt_versions` itself (join to `prompt_versions` → `prompts.organization_id`), per `drizzle/migrations/0019_prompt_registry_rls.sql`'s established precedent for a child table with no `organization_id` column of its own.

**Rationale**: The backlog item's own open question flagged this as "new table vs. JSONB array, decide based on expected file count/size." A real table gets per-file uniqueness enforcement (`unique` constraint) and RLS consistent with this repo's established tenant-isolation convention (`docs/context/database-conventions.md`) for free; a JSONB array would need application-level uniqueness checks and forgoes row-level RLS on individual files. Given the low expected file count per version (single digits to low tens, per the enforced cap), a table's extra join cost is negligible.

**Alternatives considered**: `prompt_versions.files jsonb` array — rejected per the reasoning above; also would have required a special-cased Drizzle migration to backfill/interpret existing rows' (absent) `files` value, whereas a new empty table needs no such handling.

## 5. `publishVersion` request-shape change

**Decision**: `PublishVersionParams` for a template-kind version gains `mainFile: { content: string }` (required content, `SKILL.md` name is implicit/fixed — not caller-supplied) and `supportingFiles?: Array<{ name: string; content: string }>` (optional, defaults to `[]`), replacing `systemTemplate`/`userTemplate`/`inputSchema`. `steps` (chain-kind) and `tags` are unchanged. `determinePromptVersionKind` now discriminates on `steps` vs. `mainFile` (mutually exclusive, exactly one required) instead of `steps` vs. `systemTemplate`/`userTemplate`.

**Rationale**: Matches FR-001/FR-004/FR-005/FR-006 directly; keeps the existing "exactly one of template-content or chain-steps" invariant (PDR-017) with the new field standing in for the old pair.

## 6. Publish-time validation (FR-007)

**Decision**: Enforced in `publishVersion` before any insert: main file content non-empty and ≤ 64 KB; each supporting file name unique (case-sensitive) within the submitted set, non-empty content, ≤ 64 KB; at most 20 supporting files total. Violations throw a new `InvalidVersionFilesError` (mirrors the existing `InvalidVersionShapeError` pattern) with a message naming the specific file and limit.

**Rationale**: Confirms the spec's Assumptions-section placeholder figures (64 KB per file mirroring `advanceSkillChainRun`'s precedent, ~20 supporting files) as the actual enforced values for this feature — no further clarification needed, these are internal validation constants with no user-facing tradeoff to weigh.

## 7. REST/MCP surface updates (FR-012)

**Decision**: `POST /api/skills/[name]/expand`'s request body drops `input` entirely (zod schema loses that field); its response becomes `{ content, appliedPolicies, objectives }`. `POST /api/skills/[name]/versions`' body drops `systemTemplate`/`userTemplate`/`inputSchema`, gains `mainFile`/`supportingFiles`. The MCP `sh-run` tool's input schema drops `input: z.string()`; `shRun`'s output formatting drops the `[System]`/`[User]` two-part text and emits a single body (the resolved `content`) followed by `[Policies Applied]` as today.

**Rationale**: Both routes call `expand()`/`publishVersion()` directly (confirmed by reading `src/app/api/skills/[name]/expand/route.ts` and `src/bcs/distribution/application/mcp-tools.ts`'s `shRun`) and would otherwise fail to compile/break at runtime the moment the application-layer signatures change — this is mechanical propagation, not new design, per the source backlog item's own Technical Notes ("Land the core model/expand change here first").

## 8. UI component delta

**Decision**: Existing components to modify (not rewrite from scratch):
- `prompt-detail-view.tsx` — replace the Overview tab's `TemplateBlock` system/user display with the mockup's file-count/policy-count summary cards; add a new Files tab (main + supporting file list, Preview/Plain-text toggle, per-file edit) for new-shape versions; for legacy-shape versions (no Files tab per the Clarifications decision), keep the existing inline system/user template display on Overview instead.
- `new-version-drawer.tsx` — for `kind: "template"`, replace the System-template/User-template textareas with a file-bundle editor (main file textarea + add/select/remove supporting files), matching the mockup's "New version" drawer file UI. The Chain-kind branch (`ChainStepBuilder`) is untouched.
- `new-prompt-drawer.tsx` — drop its System-template/User-template fields entirely (per the resolved mockup inconsistency, FR-018); collect name/description/tags only, then hand off into the same new-version file-bundle flow for the skill's first version.

**Rationale**: All three already exist and are the real, current implementation of what the mockup depicts (confirmed by reading each file) — this is a modification task, not new-component creation.
