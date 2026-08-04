# Research: Skill Sync CLI

## Context gathered from existing architecture

- **Server routes already exist and need no changes**: `GET /api/skills` (list, supports `?projectId=`) and `POST /api/skills/[name]/expand` (live resolve) are both live today (`src/app/api/skills/route.ts`, `src/app/api/skills/[name]/expand/route.ts`), shipped by `027-rest-api-core-routes`. Both authenticate via `resolveCaller()` (`src/shared/api/auth.ts`), which accepts `Authorization: Bearer <apiKey>` and resolves the org/user via `authenticateApiKey`. This feature is a pure client of these two routes — confirms the originating backlog item's "no new server surface" framing.
- **Usage telemetry is explicitly a different backlog item's job, already scoped to "no separate wiring" for this CLI**: `backlog/008-distribution/004-usage-telemetry.md` states that recording a `prompt_usage` row for every expansion (including via `skillcanon run`) happens once telemetry is wired into the REST expand route itself — "skill-sync invocations get telemetry for free with no separate wiring." This feature's `run` command does not need to call `recordPromptUsage` itself.
- **Git-context tagging (`gitRemoteUrl`/`gitBranch`/`gitCommitSha`) is out of scope here by design**: [PDR-013](../../docs/pdr/013-cli-side-git-context-tagging.md) describes extending the CLI's expand call with local git context, but `backlog/011-vcs-integration/004-cli-git-context-tagging-and-usage-query-api.md` (epic 011, not started) explicitly owns that work and lists `backlog/008-distribution/005-skill-sync-cli.md` (this feature) as a hard dependency — "this feature extends the existing CLI, not build it from scratch." The base `run` command built here must not attempt this; it's layered on afterward by a different feature.
- **A project detail page already exists** at `/(app)/projects/[id]/page.tsx`, reachable at `<origin>/projects/<uuid>`. No new web UI or server-side "project key issuance" endpoint exists or is needed.

## Decisions

### D1: What a "project key" is (resolves the 2026-08-03 clarification)

**Decision**: The project key is the project's own web UI URL — `https://<skillcanon-host>/projects/<project-id>` — copy-pasted by the developer from their browser while viewing that project. The CLI parses the URL: the origin becomes the API base URL (`<origin>/api/...`), the path's UUID segment becomes the linked `projectId`.

**Rationale**: Satisfies the clarification (the key encodes the server address) with zero new server-side surface — no bespoke token format to mint, store, or validate server-side. The developer already has this URL open in their browser when they'd naturally go looking for "how do I connect this repo." Matches the backlog's "no new server surface" constraint exactly.

**Alternatives considered**: A bespoke opaque encoded string (e.g. base64url JSON blob) minted by a new server endpoint — rejected as unnecessary new server surface for no added value over reusing an existing, already-navigable URL. A separate `--server` flag — rejected per the 2026-08-03 clarification answer (one pasted artifact, not two).

### D2: Package structure and tooling

**Decision**: A new, independent top-level `cli/` directory at the repo root, with its own `package.json`, not part of a pnpm workspace with the root app. Built with plain `tsc` (TypeScript → `dist/`), a `bin` entry point with a `#!/usr/bin/env node` shebang, `commander` for argument parsing, Node's native `fetch` for HTTP, and `vitest` for tests (mirroring the root app's test runner for consistency, but as its own devDependency since the package is independently published).

**Rationale**: The backlog is explicit this is "distributed separately from this app (new package)" — implying independent versioning/publishing, not a build-time dependent of the Next.js app. A flat `cli/` directory (not a pnpm workspace member) keeps that separation obvious and avoids entangling the CLI's dependency graph with the app's `.next/standalone` bundling concerns already documented as a footgun in this repo. `commander` is a minimal, dependency-light, widely-understood choice for a 3-command CLI (`init`/`sync`/`run`) — no heavier framework (oclif) is justified for this scope.

**Alternatives considered**: pnpm workspace member under `packages/skillcanon-cli` — rejected for now since no workspace exists yet and introducing one is a larger, unrequested structural change to the root repo; can be revisited later without changing the CLI's own internal design. Building the CLI as a route/script inside the main Next app — rejected, contradicts "distributed separately."

### D3: Local config/credential/manifest file shapes

**Decision**:
- `.skillcanon/project.json` (committed): `{ "server": "<origin>", "projectId": "<uuid>" }`.
- `.skillcanon/credentials.json` (gitignored via an entry this feature adds to the target repo's `.gitignore`, and written with `0600` file permissions): `{ "apiKey": "<raw key>" }`.
- `.skillcanon/sync-manifest.json` (committed — it only stores non-secret content hashes, needed by every teammate to detect their own local drift): `{ "stubs": { "<relative-stub-path>": "<sha256-hex-of-last-written-content>" } }`, mirroring `.specify/integrations/*.manifest.json`'s per-file hash-tracking shape already established in this repo (`docs/pdr/011-skill-sync-cli-and-drift-detection.md`).

**Rationale**: Splits committable (project link, sync manifest) from secret (API key) data per FR-002, matches an already-proven pattern in this same repo for the manifest, and keeps the credential file a single small JSON blob that's easy to permission and never log.

### D4: Skill stub layout and content-hash scope

**Decision**: One directory per prompt at `.claude/skills/skillcanon-<slug>/SKILL.md`, where `<slug>` is the prompt's own slug/name lowercased and kebab-cased (collisions detected and flagged per the 2026-08-03 clarification, not silently overwritten). `SKILL.md` frontmatter carries `name`/`description` sourced from the prompt's current metadata; the body is a fixed one-line instruction: run `skillcanon run <slug>` and follow the output as instructions. The content hash tracked in the sync manifest is of the full stub file's bytes as last written by the CLI.

**Rationale**: Matches the backlog's literal requirement text and Claude Code's skill-discovery convention (a `SKILL.md` per skill directory under `.claude/skills/`).

### D5: `run` command input handling

**Decision**: `skillcanon run <slug> [--input '<json-object>']`. When `--input` is omitted, an empty object `{}` is sent as the expand request's `input` field (the field the existing `POST /api/skills/[name]/expand` route already requires per its `expandSchema`). No positional free-text argument parsing beyond this — keeps the contract unambiguous.

**Rationale**: `expand()`'s existing request schema (`src/app/api/skills/[name]/expand/route.ts`) requires an `input: Record<string, unknown>` object; a governed prompt with no template variables works fine with `{}`. A single `--input` flag accepting a JSON blob is the simplest mechanism that doesn't require inventing new server-side behavior, and keeps the CLI's argument surface small enough to be reliably invoked by an agent following a one-line `SKILL.md` instruction.

### D6: Session-start hook installation

**Decision**: `skillcanon init` merges a `SessionStart` entry into the target repo's project-local `.claude/settings.json` (creating the file if absent, preserving any existing hooks/settings already present — a JSON-merge, not an overwrite), matching this feature's own 2026-08-03-resolved assumption (repo-local, not global) and Claude Code's documented project-settings hook schema:

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "skillcanon sync --quiet" }] }
    ]
  }
}
```

**Rationale**: Directly implements FR-004 at the repo-local scope already assumed in the spec.

### D7: Conflict/failure signaling shape

**Decision**: `sync` exits `0` even when individual prompts are skipped due to conflicts (FR-010a — the run overall succeeded, only specific prompts were flagged), printing one line per flagged conflict to stderr with the stub path and reason. `run` exits non-zero on any failure (network, auth, deleted prompt) per FR-009, printing a single clear message to stderr.

**Rationale**: Keeps automation-friendly semantics — a CI-adjacent or scripted `sync` call isn't treated as "failed" just because one stub needed manual attention, while `run` (a direct, single-purpose invocation) fails loudly exactly when its own one job didn't succeed, per FR-009's explicit requirement.

## Testing approach

`vitest` unit/integration tests within `cli/`, with the two HTTP calls (`GET /skills`, `POST /skills/:name/expand`) mocked via a local test HTTP server (Node's `http` module) rather than hitting a real SkillCanon instance — keeps the CLI's own test suite fast and independent of the main app's Testcontainers-based Postgres suite. File-system operations (config/credential/manifest/stub writes, `.gitignore` and `.claude/settings.json` merges) are tested against a temporary directory per test (`fs.mkdtempSync`).
