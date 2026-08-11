# Implementation Plan: Local Folder Skill Upload

**Branch**: `037-local-folder-skill-upload` | **Date**: 2026-08-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/037-local-folder-skill-upload/spec.md`

## Summary

Add a third mode ("Import from folder") to the existing New Skill drawer (`src/app/(app)/prompts/new-prompt-drawer.tsx`) that lets a signed-in user select a local folder (picker or drag-and-drop), previews every detected skill folder found inside it (any directory containing a `SKILL.md`, at any depth — covers a bare skill folder, `.claude/skills/*/`, `.agents/skills/*/`, or any other container convention uniformly), flags malformed candidates and intra-batch name conflicts, and on confirmation bulk-registers the selected ones through the existing `createPrompt`/`publishVersion` path — one independent transaction per skill, matching the sibling `001` (external-registry-import) feature's already-shipped batch pattern, but kept a fully separate code path with no source-URL/provenance concept and no fixed batch-size cap.

Two new Server Actions (`scanLocalSkillFoldersAction`, `importLocalSkillsAction`) back a new domain-layer pure function (`scanLocalSkillFolders`, `src/bcs/prompt-registry/domain/local-skill-source.ts`) that does all detection/validation/duplicate-flagging. The client only ever reads and transmits file content from directories it has already identified (by filename alone) as candidates — nothing else in the selected folder is read or sent (FR-012).

## Technical Context

**Language/Version**: TypeScript, Next.js 16 App Router (root scaffold — not `legacy/`)

**Primary Dependencies**: Next.js Server Actions, React (Client Component for the drawer), existing `@/bcs/prompt-registry` barrel (`createPrompt`, `publishVersion`, `parseSkillFrontmatter`, `MAX_FILE_SIZE_BYTES`/`MAX_SUPPORTING_FILES`), `@/shared/ui` (`Drawer` primitive, reused not re-implemented). No new npm dependency — folder selection uses the browser's own `webkitdirectory` input attribute and `DataTransferItem.webkitGetAsEntry()`, both already-standard browser APIs.

**Storage**: PostgreSQL via Drizzle — no new table/column; writes go through the existing `prompt_registry.prompts`/`prompt_registry.prompt_versions` tables via `createPrompt`/`publishVersion`, same RLS/tenant-isolation posture already enforced there.

**Testing**: Vitest. Domain-layer pure-function unit tests (`local-skill-source.test.ts`, no DOM needed) and `renderToStaticMarkup` structural tests extending `new-prompt-drawer.test.tsx`, now including an `axe-core` assertion (`expectNoCriticalOrSeriousAxeViolations`) over the drawer's real rendered content across all three modes (Constitution Principle VIII — the shared `Drawer` primitive's own test only covers its generic shell, not any consumer's actual content, so this was genuinely missing for the drawer as a whole, not just this feature's new mode). A new Vitest unit test for the pure, DOM-independent candidate-path-filtering helper in `local-folder-reader.ts`. A new Testcontainers-backed test for `runLocalSkillImportBatch` — the per-skill create/publish/error-isolation core extracted out of `importLocalSkillsAction` specifically so it's testable without a real Next.js request context (`requireActingUser()`'s `next/headers()` call isn't available outside one). Browser-only glue (`webkitdirectory`/drag-and-drop file *reading*, as opposed to the pure path-filtering logic) is still verified via live manual browser testing per `quickstart.md`, matching this repo's established convention for browser-API-only wrappers.

**Target Platform**: Web (Next.js app in a browser) — no CLI (`cli/`) or MCP surface for this feature.

**Project Type**: Web application feature, single Next.js app (root scaffold).

**Performance Goals**: No explicit numeric target in the spec; reasonable default — scanning a typical folder (a handful of skills, well under a thousand files) completes without a noticeable UI stall, since detection is a single in-memory pass over an already-enumerated `FileList`/entry tree with zero network calls.

**Constraints**: Reuses the existing `MAX_FILE_SIZE_BYTES` (64KB) / `MAX_SUPPORTING_FILES` (20) content limits already enforced by `publishVersion` — no new limit introduced (FR-008).

**Scale/Scope**: No fixed maximum batch size (FR-014, per clarification) — the preview list must handle an arbitrary number of detected candidates without breaking (the existing `Import from link` preview list is already scrollable inside the `Drawer`'s `overflow-y-auto` body, which this mode reuses unchanged).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|---|---|
| I. Test-First Development | New domain logic (`scanLocalSkillFolders`, duplicate detection, the pure candidate-path filter) all gets failing tests first. `fetchExternalSkillSourceAction` and the read-only `scanLocalSkillFoldersAction` stay untested at the action-file level (pure reads, no new logic beyond a `requireActingUser()` call). `importLocalSkillsAction`'s per-skill create/publish/error-isolation loop — genuinely new orchestration logic, and the mechanism US3 depends on — is extracted into a separately-exported `runLocalSkillImportBatch` specifically so it can get a real failing-test-first Testcontainers test, rather than repeating `importExternalSkillsAction`'s untested-by-precedent gap (caught during `/speckit-analyze`; that gap likely exists there because `requireActingUser()`'s `next/headers()` call isn't callable outside a real request, not because the loop doesn't need a test). |
| II. Domain-Driven Bounded Contexts | All detection/validation logic lives in `src/bcs/prompt-registry/domain/local-skill-source.ts`; the drawer/actions consume it only through the BC's public barrel — no direct cross-BC model access, no new contract violation. |
| III. Domain Invariants in the Domain Layer | Candidate detection, malformed-folder exclusion, and intra-batch duplicate-name rules all live in the new domain function, not scattered across the Server Action or the client component. |
| IV. Multi-Tenant Isolation by Default | No new tenant-scoped table. Registration reuses `createPrompt`/`publishVersion` inside `withTenantContext`, identical to every other skill-creation path already covered by that principle's existing enforcement and tests. |
| V. Secure by Default | No secrets involved. Uploaded skill content is plain text handled exactly like any other skill's file bundle; template rendering (the one place untrusted content is genuinely executed) happens later at `expand()` time through the already-sandboxed renderer, unaffected by this feature. |
| VI. Auditable & Compliant | `createPrompt`/`publishVersion` already write audit events via `withAudit` — reused as-is, no new audit gap introduced. |
| VII. Feature-Gated by Entitlement | No entitlement gate added, matching the sibling `001` feature's already-accepted precedent (skill creation itself carries no entitlement check in this codebase today). |
| VIII. Consistent, Accessible UI | Extends the existing `Drawer` primitive (no new hand-rolled drawer) with a third mode following the existing "import" mode's established visual/interaction pattern (design tokens, focus states, keyboard-operable checkbox rows). `Drawer`'s own test only covers its generic shell, not any consumer's real content — `/speckit-analyze` found neither mode of `NewPromptDrawer` has ever been axe-tested. `new-prompt-drawer.test.tsx` gets a new `axe-core` assertion covering all three modes' actual rendered content, closing that pre-existing gap along with this feature's own new mode. |

No violations requiring justification — Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/037-local-folder-skill-upload/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/
│   └── server-actions.md # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
src/
├── bcs/prompt-registry/
│   └── domain/
│       ├── local-skill-source.ts        # NEW — scanLocalSkillFolders(), LocalSkillCandidate/LocalSkillFileEntry/LocalSkillScanResult types
│       └── local-skill-source.test.ts   # NEW
│   └── index.ts                          # MODIFIED — barrel-export the new domain function/types
├── app/(app)/prompts/
│   ├── actions.ts                        # MODIFIED — new scanLocalSkillFoldersAction, importLocalSkillsAction (+ its extracted, separately-testable runLocalSkillImportBatch core)
│   ├── actions.local-import.test.ts      # NEW — Testcontainers test for runLocalSkillImportBatch's per-skill isolation (FR-006/FR-007)
│   ├── local-folder-reader.ts            # NEW — candidate-path filtering (pure) + browser-only folder/File reading glue (FR-012)
│   ├── local-folder-reader.test.ts       # NEW — unit tests for the pure filtering half only
│   ├── new-prompt-drawer.tsx             # MODIFIED — third "Import from folder" mode
│   └── new-prompt-drawer.test.tsx        # MODIFIED — structural assertions for the new mode + axe-core check
```

No `backend`/`frontend` split (this repo's unified Next.js scaffold), no CLI (`cli/`) change, no new REST route.

**Structure Decision**: Single Next.js application, following this repo's existing bounded-context layout (`src/bcs/prompt-registry/{domain,application,infrastructure}` + barrel, consumed by `src/app/(app)/**` via Server Actions) — no new top-level structure introduced, matching every prior feature in this epic.

## Complexity Tracking

*No Constitution Check violations — table intentionally empty.*
