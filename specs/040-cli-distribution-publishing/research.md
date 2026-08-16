# Research: CLI Distribution & Publishing

## D1: Publish target & package identity

**Decision**: Publish `cli/`'s build output to GitHub Packages' npm registry as the scoped package `@mlopstapus/skillcanon`, keeping the `bin` command name `skillcanon` unchanged. `cli/package.json` gains:
- `"private"` removed (currently `true`, blocks any publish)
- `"name": "@mlopstapus/skillcanon"` (was `"skillcanon"` — the bin name doesn't need to match the package name)
- `"license": "Apache-2.0"` (matches the repo root `LICENSE` file, not currently declared anywhere in `cli/package.json`)
- `"repository": { "type": "git", "url": "https://github.com/mlopstapus/SkillCanon.git", "directory": "cli" }` and `"homepage"` — FR-006
- `"publishConfig": { "registry": "https://npm.pkg.github.com", "access": "restricted" }` — GitHub's documented convention for GitHub Packages; belt-and-suspenders alongside the CI workflow's own registry configuration
- `"files": ["dist"]` — see D5, this is load-bearing, not cosmetic

**Rationale**: matches the already-resolved spec decision (FR-001) and mirrors the existing `docker-publish.yml`/`helm-publish.yml` registry choice exactly (same `@mlopstapus` org, same `ghcr.io`-adjacent GitHub-owned infra, same `GITHUB_TOKEN`-based auth — no new external account).

**Alternatives considered**: public npmjs.org (rejected in the spec clarification — requires claiming a new external account/org).

## D2: Publish workflow shape & version-change gating (FR-003, FR-004, FR-005)

**Decision**: New `.github/workflows/cli-publish.yml`, triggered `on: push: branches: [main], paths: ["cli/**"]` (mirrors `helm-publish.yml`'s path-scoped trigger, not `docker-publish.yml`'s unconditional one — the CLI is a genuinely separate artifact from the app image and shouldn't republish on unrelated app changes). Steps, all `working-directory: cli`:

1. Checkout, `pnpm/action-setup@v4` (auto-detects pnpm version from the root `package.json`'s pinned `packageManager` field, since `cli/package.json` has none), `actions/setup-node@v4` with `node-version-file: cli/package.json` (reads `engines.node`), `registry-url: https://npm.pkg.github.com`, `scope: '@mlopstapus'`.
2. `pnpm install --frozen-lockfile`, `pnpm run typecheck`, `pnpm test`, `pnpm run build` — the publish gate runs the CLI's own existing test suite before ever attempting to publish (no PR-time CI job exercises `cli/` today; this is the one safety net a bad build has before reaching the registry). Keeping this inside the publish workflow rather than retrofitting `ci.yml`'s `ci-gate` is a deliberate scope boundary — see plan.md Complexity Tracking.
3. **Version-change check** (FR-004): `LOCAL_VERSION=$(node -p "require('./package.json').version")`; `npm view "@mlopstapus/skillcanon@$LOCAL_VERSION" version` (authenticated via `NODE_AUTH_TOKEN`). Empty/non-zero exit → not yet published → proceed to step 4. Non-empty → already published → log a `::notice::` line naming the version and exit 0 (green, visible, not a failure — this is the expected, common case for any `cli/**` change that doesn't bump the version, e.g. a comment fix or this very workflow file's own future edits).
4. **Publish**: `npm publish`, `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`. No `--force`, no exit-code suppression — if a race lands a same-version publish between step 3's check and this step, npm's own immutable-version rejection fails the step (and therefore the job) loudly. This is what actually satisfies FR-005; step 3 is an optimization to avoid hitting that failure path on every ordinary no-bump merge, not a replacement for it.

**Permissions**: `contents: read, packages: write` — identical scope to `docker-publish.yml`/`helm-publish.yml` (FR-007).

**Traceability (FR-008)**: no custom mechanism needed — `npm publish` run from a git checkout automatically records the current commit SHA as the published version's `gitHead` metadata field (`npm view @mlopstapus/skillcanon@<version> gitHead`). Verified as standard `npm publish` behavior, not something this workflow has to construct.

**Alternatives considered**: tag-triggered publish (`on: push: tags:`) — rejected because it would require inventing a new git-tagging habit this repo has never used for Docker/Helm either; a bare `npm publish` with no gate at all — rejected, republishes (and fails) on every no-op merge to `cli/`, which is exactly FR-004's "nothing to publish" case done wrong (loud failure instead of a quiet, visible skip).

## D3: Update-check network target & auth (spec Clarification 1)

**Decision**: `cli/src/update-check.ts` queries the GitHub Packages npm registry's package metadata endpoint (`GET https://npm.pkg.github.com/@mlopstapus/skillcanon`, an npm-registry-shaped JSON document with a `dist-tags.latest` field) directly, authenticating with a token read from the person's own local `.npmrc` — not the unauthenticated GitHub REST API, not a bespoke manifest (resolved in spec clarification, Option B).

**Token resolution**: a new `cli/src/config/npm-auth.ts` reads `~/.npmrc` (via `os.homedir()`) and, if present, `<cwd>/.npmrc`, and extracts the `//npm.pkg.github.com/:_authToken=<token>` line via a minimal line-based parser (no `.ini` dependency needed — npmrc syntax here is flat `key=value` lines). No token found → the update check treats this exactly like FR-013's unreachable case (skip silently, no error). No subprocess (`npm config get`) is used — avoids a hard runtime dependency on `npm` being on `PATH` and avoids subprocess overhead inside the 2-second budget (FR-013, spec Clarification 2).

**Alternatives considered**: shelling out to `npm config get //npm.pkg.github.com/:_authToken` — rejected, adds a `npm`-on-`PATH` dependency the rest of the CLI doesn't have and unpredictable subprocess latency inside a tight timeout budget.

## D4: Update-check cache location, timing, and concurrency with command execution

**Decision**: cache file at `~/.skillcanon/update-check.json` (home-directory-scoped, distinct from the existing repo-scoped `<repoRoot>/.skillcanon/` used by `credentials.ts`/`project-link.ts` — the update check is a property of the installed binary, not of any one synced repository). Shape: `{ "lastCheckedAt": "<ISO8601>", "latestVersion": "<semver or null>" }`. `lastCheckedAt` is written on **every** check attempt, success or failure — so a machine that's offline for a week doesn't retry (and eat the 2s timeout) on every single invocation within the 24-hour window; it simply has no notice to show, silently, the same as FR-013 already requires.

**Concurrency with command execution**: the check is kicked off (as a promise, not awaited) at CLI startup, in parallel with whatever command `program.parseAsync` is about to run — not sequentially before it. The result is only awaited (racing against its own internal 2-second timeout, so this adds at most 2s of *tail* latency, only ever on a cache-miss invocation, i.e. at most once per 24h per machine) immediately before process exit, and the notice — if any — is printed to **stderr** after the command's own output. This overlap is what keeps SC-006's "no perceptible delay" true for the common (cached) case, and bounds the worst case to the already-agreed 2-second budget.

**Notice goes to stderr, not stdout**: satisfies the edge case about non-interactive/scripted invocations (FR-014's env-var override is the primary opt-out, but printing to stderr means even an *enabled* check never contaminates a command's stdout-based machine-readable output, e.g. `skillcanon run <slug>`'s resolved prompt text).

**Alternatives considered**: awaiting the check before running the command (simpler control flow, rejected — adds up to 2s of *upfront* latency to every cache-miss invocation instead of overlapping it with real work); an in-memory-only check with no cache file (rejected — would re-check, and potentially re-hit the 2s timeout, on literally every invocation, violating FR-012 outright).

**Implementation addendum (discovered during T014)**: Commander's built-in `.version()`/`--help` handling calls `process.exit()` synchronously by default, which would skip the post-command notice-printing step entirely for `--version`/`--help` invocations — a real gap against Story 3 AC1 ("the person runs any CLI command"), and against `quickstart.md` Scenario 3 which uses `skillcanon --version` as its example. Fixed by calling `program.exitOverride()` so Commander throws a `CommanderError` instead of exiting directly; `main()`'s catch block special-cases `CommanderError` (just sets `process.exitCode`, since Commander already printed its own output) versus a real application error (redact + print + exit 1) — either way, control returns to `main()` afterward and the update-check notice still gets its chance to print.

## D5: Publish payload correctness — `dist/` is git-ignored

**Finding**: the root `.gitignore` ignores `dist/` for the whole repo, and `cli/` has no `.gitignore`/`.npmignore` of its own. Relying on npm's default git-ignore-derived packing behavior for a package published from a subdirectory of a larger git repo is exactly the kind of implicit behavior that's varied across npm versions and is not worth trusting blindly.

**Decision**: add an explicit `"files": ["dist"]` allow-list to `cli/package.json` (D1). npm's `"files"` field is an authoritative allow-list that always wins regardless of `.gitignore`/`.npmignore` resolution — `package.json`, `README.md`, and the `bin`/`main` targets are included automatically regardless of `"files"`, so nothing else needs to be listed.

## D6: `--version` flag and reading the CLI's own installed version

**Finding**: `cli/src/index.ts` never calls Commander's `.version(...)` — there is no `--version`/`-V` flag today. Spec Story 1's acceptance scenario 3 ("a person runs the installed CLI's version flag") describes a capability that does not yet exist; it's an in-scope gap this feature closes, and Story 3's version-compare logic (FR-010) needs the same "read my own installed version" primitive anyway.

**Decision**: new `cli/src/version.ts` exporting `getInstalledVersion(): string`, reading `cli/package.json`'s `"version"` field at runtime via `readFileSync` relative to `fileURLToPath(import.meta.url)` (`../package.json` from the compiled `dist/version.js`) — not a compile-time JSON import, which would violate `tsconfig.json`'s `rootDir: "src"` (package.json lives one level above `src/`). `index.ts` calls `program.version(getInstalledVersion())` to wire up the flag Commander provides for free.

## D7: Version comparison

**Decision**: a small local `isNewerVersion(latest: string, current: string): boolean` in `cli/src/update-check.ts`, doing a plain numeric `major.minor.patch` comparison (`String.split(".").map(Number)`, left-to-right). No new dependency (e.g. the `semver` package) — every version this codebase publishes is a plain three-part semver with no prerelease/build metadata (FR-005's registry is the sole source of versions being compared against, and this repo's own versioning practice, per `cli/package.json`'s `0.1.0`, has no precedent for prerelease tags).

**Alternatives considered**: adding the `semver` npm package — rejected as unnecessary weight for a three-integer comparison; would be revisited if this project ever adopts prerelease tags.

## D8: Redaction coverage for the newly-introduced GitHub token

**Finding**: `cli/src/redact.ts` only redacts SkillCanon's own `sk_...` API key shape. This feature introduces the first code path that reads a *GitHub* token (from `.npmrc`, D3) into memory — a thrown error from that path (e.g. a malformed `.npmrc` line) could otherwise leak a raw token into stderr the same way a pre-existing gap once nearly did for `sk_` keys (see this repo's own prior incident, captured in project history).

**Decision**: extend `redact()` to also match GitHub's known token prefixes (`ghp_`, `github_pat_`, `gho_`, `ghu_`, `ghs_`, `ghr_`) with the same `{20,}`-length guard pattern already used for `sk_`.

## D9: Scope boundary — no retrofit of PR-time CI for `cli/`

**Decision**: this feature does not add a `cli-test`/`cli-typecheck` job to `ci.yml`'s `ci-gate` for *pull-request* time — that's a pre-existing, already-flagged gap (`.claude/anchorstack/project.md`) unrelated to distribution/publishing specifically, and out of scope for this spec. The new `cli-publish.yml` workflow (D2) does run `cli/`'s typecheck and test suite as its own pre-publish gate, which is the safety net this feature actually needs (FR-009).
