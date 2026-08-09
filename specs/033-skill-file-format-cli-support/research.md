# Phase 0 Research: Skill File Format CLI Support

All items resolved by reading the current CLI implementation directly (`cli/src/`) plus the REST surface it already calls — no external unknowns.

## 1. How `sync` fetches a skill's active-version file content

**Decision**: Extend `listSkills()`'s roster call (`GET /api/skills?projectId=...`) to also read `activeVersionId` and `kind` off each `PromptSummary` in the response — both fields are already present in the JSON body today (`listPrompts()`'s return type), the CLI's `SkillSummary` type just never picked them out. For each roster entry with a non-null `activeVersionId`, add a second call to the already-existing `GET /api/skills/[name]/versions` route and find the entry whose `id` matches `activeVersionId`; read its `.kind` and `.files`.

**Rationale**: Zero backend changes needed — both routes already return everything required. `GET /api/skills/[name]/versions` returns every version, not just the active one, but version lists are small (single digits to low tens per skill in practice) and this avoids adding a new backend endpoint or a query param to an existing one for a CLI-only concern. This is the same "reuse what already returns everything, filter client-side" choice research.md documents for the `029-skill-sync-cli`/`032-skill-file-format-refactor` precedent line of features.

**Alternatives considered**: A new `?includeActiveVersion=true` param on `GET /api/skills`, or a dedicated `GET /api/skills/[name]/active-version` route — both are real backend surface changes for a need only the CLI has today; deferred unless the two-call-per-skill roundtrip proves to be a real latency problem in practice (no evidence of that yet — `sync` already makes N+1-shaped calls in spirit via its existing per-skill file writes, just not per-skill HTTP calls until now).

## 2. `sync-manifest.json` schema migration

**Decision**: Change `SyncManifest` from `{ stubs: Record<slug, hash> }` to `{ stubs: Record<slug, Record<filename, hash>> }` — one hash per file, keyed by filename, nested under each skill's slug. An old-format manifest (a slug mapping directly to a string, not an object) is detected by `typeof value === "string"` and treated as if that slug had no Sync Record at all (i.e., dropped, not migrated field-by-field) — the next `sync` re-evaluates that skill fresh.

**Rationale**: Self-healing beats a hard migration step for a local, disposable, sync-only cache file (never the source of truth — the server always is). The one edge case this creates — a skill already synced under the old single-file pointer-stub shape, still pointer-stub-shaped after upgrading (a chain-kind or not-yet-republished skill) — resolves correctly on its own: the old manifest entry is dropped, the file's current content still matches what would be freshly rendered (same pointer-stub body), so no spurious conflict or rewrite happens; drift detection simply starts tracking it under the new per-file shape from that point on.

**Alternatives considered**: A versioned manifest with an explicit migration function — rejected as unnecessary ceremony for a cache file with no user-facing persistence guarantee (it's already gitignored, per `cli/src/gitignore.ts`).

## 3. Terminology and file renames

**Decision**: Rename `cli/src/skills/stub.ts` → `cli/src/skills/skill-file.ts`, `renderStub`/`parseStub`/`StubMetadata`/`StubInput` → `renderMainFile`/`parseMainFile`/`SkillFileMetadata`/`MainFileInput` (or equivalent) during implementation. `deriveSlug` (unrelated to content shape) is unchanged and stays in the same file.

**Rationale**: "Stub" accurately described a fixed one-line pointer; it stops being accurate the moment the body is a skill's real authored content. Renaming now avoids the file/exports permanently misdescribing what they do — a real (if small) code-quality cost for reviewers reading a "stub" that isn't one, versus the low grep-and-rename cost of doing it once, now, while the file is already being substantially rewritten anyway.

**Alternatives considered**: Leave names as-is to minimize diff noise — rejected; this file's entire body-generation logic changes in this feature regardless, so the rename adds negligible extra diff on top of a file that's being rewritten either way.

## 4. Reconciliation logic shape for multi-file skills

**Decision**: `planReconciliation()`'s per-skill action (`create`/`update`/`remove`/`conflict`) becomes a per-skill *plan* containing a list of per-file actions, since a single skill can now have some files needing `update` (server content changed, no local hand-edit) while others need `conflict` (hand-edited) in the same `sync` run — the current one-action-per-skill shape can't express that. New shape: `{ slug, mainFile: PromptVersionFile | "pointer-stub", supportingFiles: PromptVersionFile[] }` (the "what should exist" side) diffed against `{ slug, files: Record<filename, { hash, exists }> }` (the "what's tracked" side) to produce `Array<{ slug, filename, action: "create" | "update" | "remove" | "conflict", reason?: "hand-edited" }>` plus the existing skill-level `"slug-collision"` conflict (still whole-skill, unchanged — two roster skills colliding on one slug has nothing to do with individual files).

**Rationale**: Matches FR-004's requirement that each file in a bundle is tracked independently — a hand-edited supporting file must not block an untouched `SKILL.md` in the same folder from updating, and vice versa.

**Alternatives considered**: Keep skill-level granularity and treat *any* hand-edited file in a skill's folder as blocking the whole skill's sync — rejected, directly contradicts FR-004 and User Story 2's acceptance scenarios, which require independent per-file treatment.

## 5. Removing orphaned supporting files (FR-006)

**Decision**: For a tracked skill, compute the set difference between the previously-tracked filenames (from the old Sync Record) and the newly-desired filenames (from the current active version's file bundle, or the single pointer-stub filename `SKILL.md` for a no-bundle skill). Any previously-tracked filename not in the new desired set is deleted from disk (unless it's itself hand-edited, in which case it's left in place and reported as a conflict, matching the existing hand-edit-protection principle applied to removal too).

**Rationale**: Symmetric with the existing whole-skill `remove` action (a skill dropped from the roster has its whole folder removed) — this is the same idea scoped to one file within a still-tracked skill.

## 6. Chain-kind / legacy-shape skill handling (per the confirmed clarification)

**Decision**: `kind !== "template"` (chain-kind) or `files.length === 0` (legacy-shape, template-kind with no file bundle) both route to the exact same code path already in use today: render the fixed one-line pointer stub as `SKILL.md`'s sole content, with no supporting files. This is a rendering-time branch, not a separate command path — `sync`'s single loop over the roster handles all three shapes (new-shape template, legacy-shape template, chain) uniformly, branching only at the "what content goes in this skill's `SKILL.md`" step.

**Rationale**: Directly implements the confirmed clarification — zero behavior change for these two cases, only new-shape skills get new behavior.
