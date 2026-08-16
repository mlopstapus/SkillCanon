# Implementation Plan: CLI Distribution & Publishing

**Branch**: `039-cli-distribution-publishing` | **Date**: 2026-08-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/040-cli-distribution-publishing/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

The `skillcanon` CLI (`cli/`) has never been published anywhere — `cli/package.json` is `"private": true` and there is no publish workflow for it, unlike the app image and Helm chart. This feature (1) publishes it to GitHub Packages' npm registry as `@mlopstapus/skillcanon` via a new CI workflow that auto-publishes on version-bumped merges to `main` (mirroring `docker-publish.yml`/`helm-publish.yml`), and (2) adds an in-CLI update-availability check that queries the same registry (reusing the person's own install-time registry credentials) and prints a non-blocking upgrade notice, capped at a 2-second network budget and cached for 24 hours.

## Technical Context

**Language/Version**: TypeScript 5.9 (`cli/tsconfig.json`, ES2022 target, NodeNext modules), Node.js ≥24.0.0

**Primary Dependencies**: `commander` (existing, only runtime dependency) — no new runtime dependency added (D3, D7: hand-rolled `.npmrc` token parsing and semver comparison instead of adding libraries)

**Storage**: one local JSON cache file, `~/.skillcanon/update-check.json` — no database

**Testing**: `vitest` (existing `cli/test/**`, real `node:http` servers for HTTP-touching tests — see `skillcanon-client.test.ts`'s established pattern)

**Target Platform**: Node.js CLI, cross-platform (Linux/macOS/Windows wherever Node 24+ runs); CI publish runs on `ubuntu-latest`

**Project Type**: standalone CLI package (`cli/`) — a separate, non-workspace npm package per `CLAUDE.md`'s established convention, plus one new GitHub Actions workflow at the repo root

**Performance Goals**: update check adds ≤2s worst-case tail latency, overlapped with command execution rather than serialized before it (D4); no measurable overhead on the (common, cached) non-network path

**Constraints**: GitHub Packages' npm registry has no anonymous read path (auth required even for version lookups) — see D3; published tarball must explicitly allow-list `dist/` since it's git-ignored (D5)

**Scale/Scope**: single package, single publish workflow, one new CLI cross-cutting concern (update check) touching `index.ts` + 3 new modules; no data model beyond one cache file

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

This feature touches only the standalone `cli/` package and repo-root CI config — no `src/bcs/**` bounded context, no database, no web UI, no tenant data. Most constitution principles are scoped to the main application and don't engage here:

| Principle | Status | Notes |
|---|---|---|
| I. Test-First Development | **Applies** | New modules (`update-check.ts`, `npm-auth.ts`, `version.ts`) get tests written test-first, following `cli/test/**`'s existing real-`node:http`-server pattern. |
| II. Domain-Driven Bounded Contexts | N/A | `cli/` is not part of `src/bcs/**`; it's already a separate package per established convention. |
| III. Domain Invariants in Domain Layer | N/A (spirit followed) | No HTTP-handler/domain split applicable to a CLI; logic still lives in dedicated single-purpose modules, not scattered inline. |
| IV. Multi-Tenant Isolation | N/A | No tenant-scoped data; the update-check cache is a single local file per machine, not a multi-tenant resource. |
| V. Secure by Default | **Applies** | The GitHub token read from `.npmrc` must never leak into a log/error message — `redact.ts` is extended to cover GitHub's token prefixes (D8), mirroring the existing `sk_` pattern. CI publish credentials scoped to `contents: read, packages: write` only (D2/FR-007), same as Docker/Helm. |
| VI. Auditable & Compliant (SOC2) | N/A | No mutation of any tenant/user data; a local, informational version check on a developer's own machine isn't an audit-log-worthy event under this project's existing audit scope (which covers app-side mutations and cross-tenant-sensitive reads). |
| VII. Feature-Gated by Entitlement | N/A | Not a Free/Paid product surface — CLI packaging/distribution is delivery infrastructure, not an entitlement-gated feature (billing is deferred indefinitely project-wide). |
| VIII. Consistent, Accessible UI | N/A | No web UI surface added. |

**Result**: PASS. No violations requiring Complexity Tracking justification.

## Project Structure

### Documentation (this feature)

```text
specs/040-cli-distribution-publishing/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── cli-interface.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
.github/workflows/
└── cli-publish.yml           # NEW — mirrors docker-publish.yml/helm-publish.yml (D2)

cli/
├── package.json              # MODIFIED — private removed, name/license/repository/publishConfig/files added (D1, D5)
├── README.md                 # MODIFIED — install instructions (FR-002)
├── src/
│   ├── index.ts               # MODIFIED — wires --version (D6) and the update-check cross-cutting call (D4)
│   ├── version.ts             # NEW — getInstalledVersion() (D6)
│   ├── update-check.ts        # NEW — cache read/write, network query, isNewerVersion, notice formatting (D3, D4, D7)
│   ├── config/
│   │   └── npm-auth.ts        # NEW — reads GitHub Packages token from local .npmrc (D3)
│   └── redact.ts              # MODIFIED — extended to GitHub token prefixes (D8)
└── test/
    ├── version.test.ts        # NEW
    ├── update-check.test.ts   # NEW
    ├── config/
    │   └── npm-auth.test.ts   # NEW
    └── redact.test.ts         # MODIFIED — new GitHub-token-shape cases
```

**Structure Decision**: everything lives inside the existing standalone `cli/` package (mirroring its current flat `src/{commands,config,http,skills}` layout — `update-check.ts`/`version.ts` sit alongside the existing top-level modules like `redact.ts`, and `npm-auth.ts` joins `config/` next to `credentials.ts`/`project-link.ts` since it's the same kind of "read local config" concern) plus one new top-level CI workflow file, matching where `docker-publish.yml`/`helm-publish.yml` already live. No new top-level directory, no new package.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations — table intentionally omitted.
