# Implementation Plan: Skill Sync CLI

**Branch**: `029-skill-sync-cli` | **Date**: 2026-08-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/029-skill-sync-cli/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Build `skillcanon`, a standalone CLI (new, separately-published package, not part of the main Next.js app) with three commands — `init`, `sync`, `run` — that links a developer's local repository to one SkillCanon project and keeps `.claude/skills/skillcanon-*/` stub files in sync with that project's governed prompt roster. Stubs never carry resolved prompt content themselves; `run` always calls the existing, already-shipped `POST /api/skills/[name]/expand` route live at invocation time, and `sync` calls the existing `GET /api/skills` route. No server-side changes are needed (research.md). The "project key" the developer pastes during `init` is simply that project's own web UI URL (`<origin>/projects/<id>`), decomposed into the API's base origin and project id — no new server-side key-issuance surface. A `SessionStart` hook installed into the target repo's project-local `.claude/settings.json` re-runs `sync` automatically and non-fatally on every Claude Code session start.

## Technical Context

**Language/Version**: TypeScript, Node.js >=24 (matches root repo's `engines.node`)

**Primary Dependencies**: `commander` (CLI arg parsing), Node's native `fetch` (HTTP — no HTTP client dependency needed), Node's native `crypto`/`fs` (sha256 hashing, file I/O)

**Storage**: None server-side (N/A). Client-side only: local JSON files under `.skillcanon/` and `.claude/` in whatever repository the CLI is run in.

**Testing**: `vitest`, with the two REST calls mocked via a local Node `http` test server and filesystem operations run against `fs.mkdtempSync` temp directories (research.md "Testing approach")

**Target Platform**: Cross-platform CLI (macOS/Linux/Windows via Node), invoked from a developer's terminal and from Claude Code's `SessionStart` hook mechanism

**Project Type**: CLI tool — new standalone package at `cli/`, independent of the root Next.js app's build/dependency graph (research.md D2)

**Performance Goals**: Full `init` (config write + first sync) completes in well under the 2-minute SC-001 target under normal network conditions; no other domain-specific throughput targets (this is an interactively-invoked tool, not a service)

**Constraints**: Must never print/log API key material in any code path (FR-003); credential file must be created with restrictive (`0600`) permissions; `sync`'s automatic `SessionStart` invocation must never block or fail session startup (FR-013)

**Scale/Scope**: Single developer, single repository, single linked project per `init` (spec Assumptions) — no concurrency/multi-user design needed within the CLI itself

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

This feature adds a new, separately-distributed client package (`cli/`) that consumes two already-shipped, already-gated REST routes. It introduces **no new bounded context, no new database table/column, no new REST route, and no new domain invariant** in the main application — so most constitution principles apply only indirectly, through the routes it calls (which already enforce them):

- **I. Test-First Development**: Applies as normal to the new `cli/` package's own logic (config/manifest read-write, slug derivation, conflict detection, HTTP client wrapper) — tests written first per this feature's own test plan (research.md, quickstart.md).
- **II. Domain-Driven Bounded Contexts / III. Domain Invariants**: N/A to this feature directly — the CLI has no domain logic of its own; all governance/domain rules it depends on (policy/objective resolution) already live in and are enforced by the server it calls. The CLI must not re-implement or duplicate any such rule (e.g., it never caches or locally re-derives resolved prompt content — FR-008).
- **IV. Multi-Tenant Isolation**: N/A to build here — the CLI never queries the database directly; every call is authenticated (`Authorization: Bearer`) and already tenant-scoped server-side by `resolveCaller`/`listPrompts`/`expand`. Nothing in this feature bypasses that.
- **V. Secure by Default**: Directly applicable and addressed — the API key is stored in a git-ignored, `0600`-permissioned file, never logged or printed (FR-003, data-model.md "Credential"), and the CLI performs no template rendering itself (Nunjucks sandboxing stays entirely server-side, inside `expand()`).
- **VI. Auditable & Compliant**: N/A to build here — every `run` invocation is, from the server's perspective, an ordinary authenticated `expand()` call, already subject to whatever audit/telemetry wiring exists or is later added to that route (a separate backlog item's job per research.md).
- **VII. Feature-Gated by Entitlement**: N/A — this feature adds no new REST route or UI surface of its own to gate; the routes it calls are already (or not yet) gated at their own layer, unaffected by this feature.

No violations requiring justification. Re-checked after Phase 1 design below — the design (contracts/cli-commands.md, data-model.md) introduces nothing that changes this assessment.

**Post-Phase-1 re-check**: Confirmed unchanged. The finalized command contracts and data model stay entirely client-side; no gate is newly implicated.

## Project Structure

### Documentation (this feature)

```text
specs/029-skill-sync-cli/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── cli-commands.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
cli/                              # New, standalone package — not a pnpm workspace member of the root app
├── package.json                  # Independent deps: commander, vitest, typescript, @types/node
├── tsconfig.json
├── src/
│   ├── index.ts                  # Entry point — commander program wiring the 3 subcommands
│   ├── commands/
│   │   ├── init.ts               # `skillcanon init`
│   │   ├── sync.ts                # `skillcanon sync`
│   │   └── run.ts                 # `skillcanon run`
│   ├── config/
│   │   ├── project-link.ts        # Read/write .skillcanon/project.json; parse project-key URL
│   │   ├── credentials.ts         # Read/write .skillcanon/credentials.json (0600, git-ignored)
│   │   └── sync-manifest.ts       # Read/write .skillcanon/sync-manifest.json; hash comparison
│   ├── skills/
│   │   ├── stub.ts                # Slug derivation, SKILL.md render/parse, stub directory ops
│   │   └── reconcile.ts           # Diff server roster vs local stubs → create/update/remove/skip plan
│   ├── integrations/
│   │   ├── claude-settings.ts     # Merge SessionStart hook into .claude/settings.json
│   │   └── agent-docs.ts          # Idempotent CLAUDE.md/AGENTS.md blurb insertion
│   ├── http/
│   │   └── skillcanon-client.ts   # Thin fetch wrapper: listSkills(), expandSkill()
│   └── gitignore.ts               # Idempotent .gitignore entry insertion
└── test/
    ├── commands/                  # init/sync/run behavior tests (mock HTTP server + temp dirs)
    ├── config/
    ├── skills/
    └── integrations/
```

**Structure Decision**: New top-level `cli/` directory, independent package (research.md D2) — kept fully separate from `src/` (the main Next.js app's bounded contexts) since this feature has no server-side component and is meant to be published/versioned independently. Internal layout mirrors the command contracts (`contracts/cli-commands.md`) 1:1: one `commands/*` file per CLI subcommand, with shared local-state and integration concerns factored into their own small modules for testability (each independently unit-testable against a temp directory, per research.md's testing approach) rather than one large `index.ts`.

## Complexity Tracking

*No Constitution Check violations — this section is not applicable.*
