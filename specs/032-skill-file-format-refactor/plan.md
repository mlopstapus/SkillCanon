# Implementation Plan: Skill File Format Refactor

**Branch**: `032-skill-file-format-refactor` | **Date**: 2026-08-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/032-skill-file-format-refactor/spec.md`

## Summary

Replace a skill (template-kind `prompt_versions`) version's flat `{{var}}`-templated `system_template`/`user_template`/`input_schema` with a required Markdown main file (`SKILL.md`) plus zero or more named supporting files, stored in a new `prompt_version_files` table. `expand()` drops its `input` parameter and returns a single resolved `content` string (plus applied policies/objectives) instead of a `systemMessage`/`userMessage` pair. Every version published before this feature ships keeps resolving exactly as today, forever — no auto-conversion (confirmed with the user). The REST `expand`/`versions` routes and the MCP `sh-run` tool are updated to match, since both call these functions directly. The app's skill-detail Overview/Files tabs and the New skill/New version drawers are updated to author and browse the new file-bundle shape, per the `SkillCanon Skills.dc.html` design mockup.

## Technical Context

**Language/Version**: TypeScript 5, Next.js 16 (App Router), Node.js runtime (root scaffold — see repo `CLAUDE.md`)

**Primary Dependencies**: Drizzle ORM (Postgres), Nunjucks (sandboxed template rendering, `template-renderer.ts`), Zod (route validation), existing `@/bcs/governance`, `@/bcs/distribution`, `@/bcs/audit-compliance` cross-BC calls

**Storage**: PostgreSQL — new table `prompt_registry.prompt_version_files`; `prompt_registry.prompt_versions.input_schema` column dropped; `system_template`/`user_template` columns kept (read-only for new inserts, still read for legacy rows)

**Testing**: Vitest, Testcontainers-backed Postgres for infrastructure/application tests (this repo's established pattern — no mocked DB)

**Target Platform**: Server (Next.js route handlers + MCP server) and web app (React/Next.js UI)

**Project Type**: Web application (single Next.js app at repo root, per `docs/context/repo-structure.md`)

**Performance Goals**: No new performance targets — same request-scoped, per-invocation resolution model as today (PDR-010 governance-freshness guarantee unchanged)

**Constraints**: 64 KB max per file, 20 max supporting files per version (Research §6); main file name fixed to `SKILL.md`; no background migration job (must not touch existing rows)

**Scale/Scope**: Backend (schema + 2 application functions + 2 domain files + 1 infra renderer file + 2 REST routes + 1 MCP tool) + frontend (3 existing components modified: `prompt-detail-view.tsx`, `new-version-drawer.tsx`, `new-prompt-drawer.tsx`)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| P1 — Test-first | **Pass (planned)** | Tasks will follow red-green-iterate; this repo's TS scaffold additionally has `tsc` as a second correctness signal the legacy Python backend lacked, used per existing convention as a real-callsite audit after signature changes (not a substitute for tests). |
| D1 — Bounded contexts | **Pass** | All changes stay inside `prompt-registry`'s own layers; REST/MCP consumers only call its exported `expand`/`publishVersion`, unchanged boundary. |
| D2 — Domain invariants in domain layer | **Pass** | File-count/size validation and the mutually-exclusive `mainFile`/`steps` check live in `domain/prompt.ts`/`publish-version.ts` (application), not duplicated in the REST route or MCP tool — mirrors the existing `determinePromptVersionKind` pattern. |
| M1/M2/M3 — Tenant isolation | **Pass (planned)** | New `prompt_version_files` table gets RLS via the same `EXISTS`-through-`prompt_versions` pattern already established for `prompt_versions` itself (0019 migration); a cross-tenant negative test is planned for it (M3). |
| S1 — Secrets hashed | N/A | No secrets involved. |
| S2 — Sandboxed template rendering | **Pass** | New-shape content renders through the same `createSandboxedEnvironment()`/`throwOnUndefined` Nunjucks setup, unchanged; no new rendering surface introduced. |
| S3 — No secrets in logs | N/A | No new logging. |
| C1 — Audit logging | **Pass** | `publishVersion` already audits via `withAudit`/`record` (`prompt_version.published`) — unchanged call shape, just a different `versionValues` payload recorded as `after`. |
| C2 — Encryption/no insecure defaults | N/A | No new transport or config surface. |
| G1 — Entitlement-gated | **N/A (justified)** | This is a refactor of existing, already-shipped `prompt-registry` capability (publish/expand), not a new feature surface — no entitlement check exists anywhere in `prompt-registry` today (confirmed by grep), so this change does not introduce or remove gating, consistent with current registry-wide precedent. |

No violations requiring Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/032-skill-file-format-refactor/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/
│   ├── expand.md
│   └── publish-version.md
└── tasks.md              # Phase 2 output (/speckit-tasks — not yet created)
```

### Source Code (repository root)

```text
src/bcs/prompt-registry/
├── domain/
│   ├── prompt.ts                          # PublishVersionParams, PromptVersionSummary, PromptVersionFile, InvalidVersionFilesError
│   └── expansion.ts                       # ExpandParams, ExpansionResult (content instead of systemMessage/userMessage)
├── infrastructure/
│   ├── schema.ts                          # + promptVersionFiles table
│   ├── prompt-versions-repo.ts            # insertPromptVersion accepts files; version reads join files
│   ├── prompt-version-files-repo.ts       # NEW — insert/list files for a version
│   └── template-renderer.ts               # IncludableVersion tagged union; renderContentWithIncludes
├── application/
│   ├── publish-version.ts                 # validate + insert files
│   ├── expand.ts                          # branch legacy vs. new-shape; compose content
│   ├── fork-skill.ts                      # update its own insertPromptVersion call site (per prior-signature-change precedent)
│   └── *.test.ts                          # updated + new tests throughout
└── CONTRACT.md                            # update exported types table

drizzle/migrations/
└── NNNN_prompt_registry_skill_files.sql   # create prompt_version_files (+ RLS), drop input_schema column

src/app/api/skills/[name]/
├── expand/route.ts                        # drop input from request schema; response shape
└── versions/route.ts                      # drop systemTemplate/userTemplate/inputSchema; add mainFile/supportingFiles

src/bcs/distribution/application/mcp-tools.ts   # sh-run: drop input arg; single-content output formatting

src/shared/api/errors.ts                   # register InvalidVersionFilesError → 422

src/app/(app)/prompts/
├── new-prompt-drawer.tsx                  # drop template fields; name/description/tags only
└── [name]/
    ├── new-version-drawer.tsx             # template kind: file-bundle editor instead of textareas
    └── prompt-detail-view.tsx             # Overview summary cards; new Files tab; legacy-shape inline fallback
```

**Structure Decision**: All backend changes stay within the existing `prompt-registry` bounded context (domain/infrastructure/application layers) plus the two existing cross-BC consumer surfaces (REST routes under `src/app/api/skills/`, the MCP tool in `src/bcs/distribution`) that already call `expand()`/`publishVersion()` directly — no new bounded context, no new top-level directory. Frontend changes modify three existing components under `src/app/(app)/prompts/` rather than introducing a new route or page.

## Complexity Tracking

*No entries — no Constitution Check violations.*
