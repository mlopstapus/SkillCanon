# Quickstart: Validating CLI Distribution & Publishing

## Prerequisites

- A merge to `main` that touches `cli/**` with `cli/package.json`'s `version` bumped, to trigger `cli-publish.yml`.
- A GitHub Personal Access Token with `read:packages` scope for install/update-check testing (`write:packages` is only needed for the CI publish step itself, which uses `GITHUB_TOKEN`, not a personal token).

## Scenario 1 — Publish workflow runs on a version-bumped merge (Story 2, FR-003/FR-004/FR-005)

1. Bump `cli/package.json`'s `version`, merge to `main`.
2. Watch the `Publish CLI` workflow run in the Actions tab — expect: install → typecheck → test → build → version-check (not yet published) → `npm publish` succeeds.
3. Confirm: `npm view @mlopstapus/skillcanon versions` lists the new version; `npm view @mlopstapus/skillcanon@<version> gitHead` matches the merge commit SHA (FR-008).
4. Merge an unrelated `cli/**` change (e.g. a comment fix) with **no** version bump. Expect: workflow run is green, but the log shows a `::notice::` that the version was already published and nothing was pushed (FR-004) — not a failure.

## Scenario 2 — Fresh install with no local clone (Story 1, FR-001/FR-002)

On a machine that has never cloned this repository:

```sh
npm config set @mlopstapus:registry https://npm.pkg.github.com
npm login --scope=@mlopstapus --registry=https://npm.pkg.github.com   # or set //npm.pkg.github.com/:_authToken directly
npm install -g @mlopstapus/skillcanon
skillcanon --version   # prints the just-installed version (SC-001)
```

## Scenario 3 — Update notice appears, then goes quiet (Story 3, FR-010–FR-014)

1. With an older version installed (Scenario 2) and a newer one already published (Scenario 1), run any command, e.g. `skillcanon --version`.
2. Expect an upgrade notice on **stderr** (not stdout — verify by redirecting: `skillcanon --version 2>/dev/null` prints only the version, no notice) naming both versions and the literal `npm install -g @mlopstapus/skillcanon@latest` command.
3. Run the command again immediately — expect no repeated network call (inspect `~/.skillcanon/update-check.json`'s `lastCheckedAt` — unchanged across the two runs within the 24h window).
4. `SKILLCANON_DISABLE_UPDATE_CHECK=1 skillcanon --version` — expect no notice, and `~/.skillcanon/update-check.json` untouched (mtime unchanged).
5. Disconnect network (or point `~/.npmrc` at a bogus token) and run a command — expect it completes normally with no notice and no visible error, within ~2s of any added delay (FR-013, SC-006).

## Scenario 4 — Upgrade after install

```sh
npm install -g @mlopstapus/skillcanon@latest
skillcanon --version   # now matches the new published version
```
