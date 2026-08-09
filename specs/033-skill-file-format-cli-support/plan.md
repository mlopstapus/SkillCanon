# Implementation Plan: Skill File Format CLI Support

**Branch**: `033-skill-file-format-cli-support` | **Date**: 2026-08-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/033-skill-file-format-cli-support/spec.md`

## Summary

Rework `skillcanon sync`'s stub-generation so a new-shape skill's real main-file content plus its supporting files are synced into `.claude/skills/skillcanon-<slug>/`, replacing the fixed one-line pointer stub for those skills — closing the gap between what the SkillCanon app shows a skill's content to be and what a local Claude Code session actually sees. Drift detection (hand-edit protection) extends from one hash per skill to one hash per file. Chain-kind and legacy-shape (pre-`032-skill-file-format-refactor`) skills keep exactly today's pointer-stub behavior, per the user's confirmed decision. `skillcanon run` is untouched — still a fully live call with zero caching, per PDR-010.

## Technical Context

**Language/Version**: TypeScript 5, standalone Node.js CLI package (`cli/`, own `package.json`/lockfile/`tsconfig.json`, excluded from the root workspace's typecheck/lint per `029-skill-sync-cli`'s established convention)

**Primary Dependencies**: `commander` (CLI framework, existing), Node built-ins only for file I/O (`node:fs`, `node:path`, `node:crypto`) — no new dependency

**Storage**: Local filesystem only (`.claude/skills/`, `.skillcanon/sync-manifest.json`) — no database/schema involvement, no new REST endpoints (both calls this feature needs already exist)

**Testing**: Vitest, `cli/`'s existing convention — mocked HTTP server (`node:http`) + real temp directories (`node:fs`'s `mkdtempSync`), no Testcontainers/Docker

**Target Platform**: Developer machines running the CLI locally against a real or local SkillCanon server

**Project Type**: CLI tool (single package)

**Performance Goals**: No new performance target; the added per-skill `GET .../versions` call is a bounded N+1 (roster size × 1 extra call), acceptable for a manually-or-session-start-invoked command — revisit only if real-world roster sizes make this noticeably slow (research.md §1)

**Constraints**: `skillcanon run` must remain fully live (PDR-010) — this feature must not introduce any code path where `run` reads a synced file instead of calling the server

**Scale/Scope**: 5 existing CLI files modified (`sync.ts`, `reconcile.ts`, `sync-manifest.ts`, `stub.ts` → renamed, `skillcanon-client.ts`), `agent-docs.ts`'s blurb text updated, corresponding test files updated

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| P1 — Test-first | **Pass (planned)** | Tasks follow red-green-iterate; `cli/`'s own fast mocked-server test convention makes this cheap to iterate on. |
| D1 — Bounded contexts | **N/A** | Entirely within the standalone `cli/` package; no `src/bcs/*` changes, no new backend surface. |
| D2 — Domain invariants in domain layer | **Pass** | Per-file conflict/hand-edit detection logic lives in `reconcile.ts` (the CLI's own "domain" module for this concern), not duplicated in `sync.ts`'s command handler — mirrors the existing split. |
| M1/M2/M3 — Tenant isolation | **N/A** | No database table involved; tenant scoping is already enforced server-side by the two REST routes this feature calls (unchanged). |
| S1 — Secrets hashed | **N/A** | No new secret handling. |
| S2 — Sandboxed template rendering | **N/A** | No template rendering happens client-side — synced content is written verbatim as returned by the server. See the clarification note below Constitution Check. |
| S3 — No secrets in logs | **Pass** | No new logging of sensitive data; existing `redact.ts` API-key redaction is untouched. |
| C1 — Audit logging | **N/A** | `sync`/`run` are reads from the CLI's perspective; the server-side `expand()` call `run` makes is already audited (`032-skill-file-format-refactor`), unchanged here. |
| C2 — Encryption/no insecure defaults | **N/A** | No new transport or config surface. |
| G1 — Entitlement-gated | **N/A (justified)** | This is a CLI-side rework of an existing, already-shipped capability (`sync`), not a new feature surface — matches the same precedent already established for `032-skill-file-format-refactor`. |

**Important clarification for S2/governance**: the files this feature syncs are a skill's **authored** content (what an author wrote), not the governance-resolved output `expand()`/`run` produces (which weaves in the invoking user's policies/objectives fresh every time). Syncing authored content, not resolved content, is deliberate and required by PDR-010 — resolved content is per-invoking-user and must never be cached to disk. This plan does not sync anything through the sandboxed Nunjucks renderer at all; it's a raw content copy.

No violations requiring Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/033-skill-file-format-cli-support/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── sync-command.md
└── tasks.md              # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
cli/src/
├── http/
│   └── skillcanon-client.ts       # SkillSummary gains activeVersionId/kind; new getSkillVersions() call
├── skills/
│   ├── stub.ts → skill-file.ts    # renderStub/parseStub → renderMainFile/parseMainFile; deriveSlug unchanged
│   └── reconcile.ts               # ReconcileAction becomes per-(skill,file); orphan-file removal logic
├── config/
│   └── sync-manifest.ts           # SyncManifest.stubs: Record<slug,hash> → Record<slug,Record<filename,hash>>
├── commands/
│   └── sync.ts                    # runSync() resolves SkillContent per roster entry, writes multi-file folders
└── integrations/
    └── agent-docs.ts              # BLURB text updated

cli/test/
├── http/skillcanon-client.test.ts
├── skills/{skill-file,reconcile}.test.ts
├── config/sync-manifest.test.ts
└── commands/sync.test.ts
```

**Structure Decision**: All changes stay within the existing standalone `cli/` package's existing file layout (renaming `stub.ts`→`skill-file.ts` per research.md §3) — no new top-level directory, no backend (`src/`) changes at all.

## Complexity Tracking

*No entries — no Constitution Check violations.*
