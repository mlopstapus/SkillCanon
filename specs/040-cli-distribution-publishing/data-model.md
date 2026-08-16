# Data Model: CLI Distribution & Publishing

No database is involved — this feature's "data" is package/registry metadata and one small local cache file.

## CLI Package (`cli/package.json`, published artifact)

| Field | Type | Notes |
|---|---|---|
| `name` | string | `"@mlopstapus/skillcanon"` — scoped for GitHub Packages (D1) |
| `version` | string | plain `major.minor.patch` semver, maintainer-bumped per PR (spec Assumptions) |
| `private` | — | removed entirely (was `true`, blocked all publishing) |
| `description` | string | unchanged, already present |
| `license` | string | `"Apache-2.0"` — new, matches root `LICENSE` |
| `repository` | object | `{ type: "git", url: "https://github.com/mlopstapus/SkillCanon.git", directory: "cli" }` — new (FR-006) |
| `homepage` | string | new (FR-006) |
| `publishConfig` | object | `{ registry: "https://npm.pkg.github.com", access: "restricted" }` — new (D1) |
| `files` | string[] | `["dist"]` — new, authoritative pack allow-list (D5) |
| `bin` | object | unchanged — `{ "skillcanon": "dist/index.js" }` |

## Publish Workflow Run (`.github/workflows/cli-publish.yml`, ephemeral CI state — not persisted by this app)

| Field | Notes |
|---|---|
| trigger commit SHA | the checkout `actions/checkout` step's ref — becomes the published version's `gitHead` automatically via `npm publish` (D2) |
| outcome | one of: `published` (step 4 ran, `npm publish` exit 0) / `skipped-no-version-change` (step 3 found the version already published, FR-004) / `failed` (typecheck/test/build failure, or `npm publish` itself rejected — FR-005) |

## Update Check Result (`~/.skillcanon/update-check.json`, local file on the machine running the CLI)

| Field | Type | Notes |
|---|---|---|
| `lastCheckedAt` | string (ISO 8601) | written on every check attempt, success or failure (D4) — gates the 24-hour re-check window (FR-012) |
| `latestVersion` | string \| null | the registry's `dist-tags.latest` at last successful check; `null` if the last attempt failed (no token, network, timeout — FR-013) so a stale failure doesn't get mistaken for "no update available" forever once connectivity returns |

Home-directory-scoped (`~/.skillcanon/`, not `<repoRoot>/.skillcanon/`) — this is a property of the installed binary, independent of which repository it's invoked from (D4). Distinct directory namespace from the existing repo-scoped `.skillcanon/` used by `credentials.ts`/`project-link.ts`, which lives inside whichever project repo `skillcanon init` was run in.
