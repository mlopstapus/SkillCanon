# Contract: CLI Interface Additions

## `skillcanon --version` / `-V`

New. Wired via Commander's built-in `.version()` (D6), sourced from `cli/package.json`'s own `version` field at runtime. Prints the installed version to stdout and exits 0. No change to any existing command's behavior (FR-009).

## Update-availability notice (all commands)

Not a new command — a cross-cutting addition to every existing command's invocation (`init`, `sync`, `run`, and the new `--version`).

- **When shown**: a newer version is available on the registry than the one installed (FR-010), the check wasn't disabled (FR-014), and the check completed (from cache or a fresh lookup) within its time budget (FR-013, spec Clarification 2: 2s).
- **Where**: stderr, printed after the command's own output — never stdout (D4). Never affects exit code (FR-011).
- **Format** (exact wording is an implementation detail; content is contractual):
  ```
  A new version of skillcanon is available: <installed> → <latest>
  Run: npm install -g @mlopstapus/skillcanon@latest
  ```
  The upgrade command is always the literal string above regardless of how the CLI was actually installed (spec Clarification 3).
- **Disabling**: set `SKILLCANON_DISABLE_UPDATE_CHECK=1` (any truthy-looking value) — when set, the check MUST NOT run at all: no cache read/write, no network call, no output (FR-014).

## Install (documentation contract, `cli/README.md`)

Replaces the current "build it locally" instructions (FR-002) with:

```sh
npm config set @mlopstapus:registry https://npm.pkg.github.com
npm install -g @mlopstapus/skillcanon
```

Requires a GitHub Personal Access Token with `read:packages` scope available to `npm` (via `~/.npmrc`'s `//npm.pkg.github.com/:_authToken=<token>` line, or `npm login --scope=@mlopstapus --registry=https://npm.pkg.github.com`) — GitHub Packages has no anonymous/unauthenticated read path, unlike public npmjs.org. This one-time setup is also what makes the update check (above) able to query the registry later using the same stored credential (D3).

## Registry metadata contract (external dependency, not owned by this repo)

`GET https://npm.pkg.github.com/@mlopstapus/skillcanon`, `Authorization: Bearer <token from .npmrc>`. Standard npm-registry-shaped JSON response; the only field this feature reads is `dist-tags.latest` (a semver string). Any other shape (404, non-JSON, missing field) is treated as a failed check per FR-013 — this repo does not control this endpoint's contract, only consumes it defensively.
