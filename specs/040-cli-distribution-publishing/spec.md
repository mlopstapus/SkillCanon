# Feature Specification: CLI Distribution & Publishing

**Feature Branch**: `039-cli-distribution-publishing`

**Created**: 2026-08-15

**Status**: Draft

**Input**: User description: "we need to think about distribution... how is the cli packaged and published? Right now the CLI isn't published anywhere — cli/package.json has 'private': true, and there's no publish workflow for it (only docker-publish.yml and helm-publish.yml exist, mirroring the app image and Helm chart to ghcr.io/mlopstapus/*). Users would have to build it locally (pnpm --dir cli run build) and run dist/index.js by hand. This was flagged as an open question back in 005-skill-sync-cli ('exact CLI package name/publish target — not yet decided') and never actually resolved. Recommendation: publish to GitHub Packages' npm registry under the same @mlopstapus org already used for Docker/Helm, mirroring the existing docker-publish.yml pattern (build on merge to main, tag by version, push)."

## Clarifications

### Session 2026-08-15

- Q: What does the update-availability check (FR-010) query to find the latest published version? → A: Query the GitHub Packages npm registry directly, reusing the local registry credentials (`.npmrc`) already configured for install (Option B) — no new git-tag or manifest convention needed, and stays accurate to the real published package.
- Q: What's the maximum time the update check may spend before giving up and falling through to FR-013's silent-degrade path? → A: 2 seconds.
- Q: Which upgrade command does the notice show (FR-010)? → A: Always show the canonical `npm install -g @mlopstapus/skillcanon@latest` command, regardless of how the person actually installed it (Option A) — no runtime package-manager detection.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Install the CLI with a standard package manager command (Priority: P1)

A person who wants to sync their repository's skills with a SkillCanon project (per the CLI's existing purpose, `029-skill-sync-cli`) currently has to clone the whole SpecHub/SkillCanon monorepo, run a local build, and invoke `dist/index.js` directly — an unreasonable bar for anyone who isn't already a contributor to this codebase. Once this feature ships, that person can install the CLI with a single, well-known package-manager command instead.

**Why this priority**: Without this, the CLI effectively does not exist for anyone outside the team building it — every other CLI feature (`029-skill-sync-cli`, `033-skill-file-format-cli-support`) is unreachable in practice. This is the minimum required for the CLI to deliver any value at all to a real end user.

**Independent Test**: Can be fully tested by running the documented install command on a machine that has never cloned this repository, then successfully running the installed binary's `--version`/`--help` output.

**Acceptance Scenarios**:

1. **Given** a person has never cloned this repository, **When** they follow the documented installation instructions, **Then** they end up with a working `skillcanon` command on their `PATH` without manually building any source.
2. **Given** the CLI has already been installed, **When** a new version is published, **Then** the person can upgrade to the new version using the same package manager's standard upgrade command.
3. **Given** a person runs the installed CLI's version flag, **When** the output is inspected, **Then** it reports a version number that matches the most recently published release.

---

### User Story 2 - Every merged CLI change is published without manual intervention (Priority: P2)

A maintainer who lands a change to the `cli/` package (a bug fix, a new command, support for a new skill file format) wants that change to reach installable users without having to remember a separate manual publish step — the same way merging to `main` already produces a fresh Docker image and Helm chart automatically.

**Why this priority**: Manual publishing is exactly the kind of step that gets forgotten, producing the same "flagged but never resolved" drift this feature exists to close. Automating it is what makes User Story 1 stay true release after release, not just once.

**Independent Test**: Can be fully tested by merging a version-bumped change to `cli/` into `main` and confirming, without any further human action, that a new package version becomes installable within a normal CI run's duration.

**Acceptance Scenarios**:

1. **Given** a pull request bumps the CLI's package version and is merged to `main`, **When** the merge completes, **Then** a new version of the package is published automatically, with no manual publish command required.
2. **Given** a pull request touches files under `cli/` but does not bump the package version, **When** the merge completes, **Then** no new (duplicate or invalid) version is published, and the workflow reports this clearly rather than failing silently.
3. **Given** the publish step fails (e.g., a transient registry outage), **When** a maintainer looks at the CI run, **Then** the failure is visible and actionable in the same place the existing Docker/Helm publish failures already are.

---

### User Story 3 - The CLI tells me when a newer version is available (Priority: P3)

Someone who installed the CLI a while ago and hasn't thought about it since is quietly running an outdated version — missing bug fixes and new capabilities (like `033-skill-file-format-cli-support`'s format support) with no reason to know an upgrade exists. When they run the CLI, it checks whether a newer version has been published and, if so, tells them plainly, without getting in the way of the command they were actually trying to run.

**Why this priority**: This is what makes ongoing publishing (Story 2) actually reach already-installed users — without it, a person who installed once has no signal to ever come back and upgrade. It's a refinement layered on top of Stories 1 and 2, not a blocker for either.

**Independent Test**: Can be fully tested by installing an older published version, publishing a newer one, then running any CLI command and confirming an upgrade notice appears alongside the command's normal output.

**Acceptance Scenarios**:

1. **Given** a newer version has been published than the one currently installed, **When** the person runs any CLI command, **Then** the CLI prints a clear notice stating the currently-installed version, the newer available version, and the exact command to upgrade.
2. **Given** the installed version is already the latest published version, **When** the person runs any CLI command, **Then** no upgrade notice is shown.
3. **Given** the machine running the CLI has no network access or the registry is unreachable, **When** the person runs a CLI command, **Then** the command still completes its normal work with no error or delay attributable to the version check.
4. **Given** an upgrade notice was already shown recently, **When** the person runs another CLI command shortly after, **Then** the CLI does not re-check for a new version on every single invocation (see FR-012) — it reuses the recently-checked result.

---

### User Story 4 - A maintainer can trace exactly what a published version contains (Priority: P4)

A maintainer or a user reporting an issue wants to know which published CLI version corresponds to which commit/change, so bug reports and support conversations can reference a specific, reproducible release rather than "whatever `main` currently has."

**Why this priority**: Useful for support and debugging once the CLI has real external users, but not required for the CLI to be installable and usable in the first place — it's a refinement of Story 2, not a blocker for it.

**Independent Test**: Can be fully tested by picking any published version number and confirming it can be traced back to a specific commit/tag in this repository's history.

**Acceptance Scenarios**:

1. **Given** a published package version, **When** someone looks it up in the package registry, **Then** they can determine which commit or release in this repository it corresponds to.
2. **Given** two different published versions, **When** their version numbers are compared, **Then** the newer one is unambiguously identifiable as newer (standard version ordering).

---

### Edge Cases

- What happens when someone tries to install the CLI without first configuring whatever registry access the chosen distribution target requires (see FR-002)? The failure must surface a clear, actionable message, not a generic "package not found."
- What happens if a merge to `main` changes `cli/` code but the package version in `cli/package.json` is left unchanged (a forgotten version bump)? The system must not silently skip publishing forever — see FR-004 for the required signal.
- What happens if two merges to `main` land in quick succession, each bumping the version once? Both publishes must succeed independently and in the correct order, without one clobbering or racing the other.
- What happens when a previously published version needs to be pulled (e.g., it contains a serious bug or an accidentally-included secret)? This is out of scope for this feature (see Assumptions) but must not be blocked by anything this feature introduces.
- What happens when the update check runs in a non-interactive/scripted context (CI, an automated skill-sync run)? The notice must not be mistaken for an error or break machine-readable output — see FR-014.
- What happens if the person is deliberately staying on an older version on purpose (e.g., pinned for compatibility)? The notice is informational only — it must never block, delay, or alter the outcome of the command being run.
- What happens when the person's local registry credentials (`.npmrc`) are missing, expired, or scoped only for a one-time install rather than persistent read access (e.g., a CI-only token that was never saved locally)? Per FR-013, this is treated exactly like any other unreachable-registry case — no notice is shown, no error surfaces, and the command proceeds normally.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The CLI MUST be distributable via GitHub Packages' npm registry under the existing `@mlopstapus` org — the same registry and CI credentials already used for Docker image and Helm chart publishing (`docker-publish.yml`, `helm-publish.yml`), published as the scoped package `@mlopstapus/skillcanon`. This requires an end user to configure a scoped registry mapping (pointing `@mlopstapus` at `https://npm.pkg.github.com`) before `npm install -g @mlopstapus/skillcanon` succeeds — see FR-002.
- **FR-002**: Documentation MUST tell a new user the exact, complete steps to install the CLI, including any one-time registry configuration the chosen distribution target requires (FR-001).
- **FR-003**: The system MUST publish a new package version automatically when a change that bumps the CLI's package version is merged to the main branch, requiring no separate manual publish action by a maintainer.
- **FR-004**: The system MUST NOT publish a new version when the CLI's package version has not changed since the last published version, and MUST make this "nothing to publish" outcome visible in the workflow's output rather than silently doing nothing indistinguishably from success.
- **FR-005**: The system MUST reject (fail the publish workflow, not silently overwrite) an attempt to publish a version number that has already been published.
- **FR-006**: Published package metadata MUST include enough information (package description, repository link, license) for someone encountering the package in a registry listing to understand what it is and where its source lives.
- **FR-007**: The publish workflow MUST use credentials/authentication scoped no more broadly than required to publish this one package, consistent with this repository's existing CI credential-scoping practices for Docker/Helm publishing.
- **FR-008**: Each published version MUST be traceable back to the exact commit in this repository it was built from.
- **FR-009**: The published package MUST expose the same command-line behavior (commands, flags, output) as running the CLI from a local build of the same source — publishing must not change or omit functionality.
- **FR-010**: On each invocation, the CLI MUST compare its own installed version against the latest version published to the GitHub Packages registry (FR-001), queried directly using the same local registry credentials (`.npmrc`) already required to install the package — and, when the latest is newer, display an upgrade notice giving the installed version, the latest version, and the canonical upgrade command `npm install -g @mlopstapus/skillcanon@latest` (always this exact command, regardless of which package manager actually installed the CLI — no runtime detection). No new git-tag or separate version-manifest artifact is introduced for this check.
- **FR-011**: The upgrade notice MUST be purely informational — it MUST NOT block, delay in any noticeable way, or alter the outcome/exit code of the command the person actually ran.
- **FR-012**: The CLI MUST NOT perform the registry version check on every single invocation — it MUST cache the result and re-check at most once per a bounded interval (reasonable default: once every 24 hours), reusing the cached result for invocations within that window.
- **FR-013**: The registry version check MUST time out after 2 seconds if it has not completed; on timeout, or any other failure (no network, registry unreachable), the CLI MUST proceed with the requested command as if no newer version exists — the check failing MUST NOT surface as an error or warning distinct from simply not showing an upgrade notice.
- **FR-014**: The update check MUST be possible to disable outright (e.g., via an environment variable), and MUST NOT run at all, print anything, or make a network call when disabled — required for CI and other non-interactive/automated invocations of the CLI.

### Key Entities

- **CLI Package**: The distributable unit built from `cli/`'s source — has a name, a semantic version, a description, and a set of published version history. Currently exists only as an unpublished local build artifact.
- **Publish Workflow Run**: One automated attempt to publish a CLI Package version, triggered by a merge to main — has an outcome (published / skipped-no-version-change / failed) and is traceable to the triggering commit.
- **Update Check Result**: The outcome of comparing an installed CLI's version against the latest published version at a point in time — has a checked-at timestamp (for cache-freshness, FR-012) and, when stale or absent, triggers a fresh registry lookup on the next eligible invocation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A person with no prior connection to this repository can go from "has never heard of the CLI" to "has a working `skillcanon` command installed" in under 5 minutes, following only the published documentation.
- **SC-002**: 100% of merges to `main` that bump the CLI's package version result in that version becoming installable within the same timeframe the existing Docker image/Helm chart publishes already take (i.e., one normal CI run), with zero manual steps.
- **SC-003**: Zero merges to `main` produce a duplicate-version publish failure or a silently-skipped publish that goes unnoticed by maintainers.
- **SC-004**: Every version a user can install can be traced back to a specific source commit by a maintainer within a few minutes, with no more effort than checking the registry listing and this repository's commit history.
- **SC-005**: A person running an outdated CLI sees an upgrade notice within their first command invocation after a newer version has been published (subject to the caching window in FR-012), without needing to separately check the registry themselves.
- **SC-006**: The update check adds no more than 2 seconds to normal CLI command execution even in the worst case (registry unreachable/timing out), and never causes a command to fail or behave differently as a result.

## Assumptions

- The CLI's existing commands, sync logic, and skill file format support are unchanged by this feature — the only new runtime behavior this feature adds is the update-availability check/notice (Story 3); everything else is purely about how the already-built artifact reaches an installer.
- Version bumping itself (deciding *when* a change warrants a new version and *what* that version number should be) is a normal part of a maintainer's existing PR workflow, the same way it already is for any other versioned artifact in this repository — this feature does not need to auto-decide version numbers on a maintainer's behalf.
- Yanking/deprecating a previously published bad version is a standard registry-provided capability (both GitHub Packages and npmjs.org support it) and does not need a bespoke mechanism built by this feature.
- The CLI continues to target the same runtime environment already declared in `cli/package.json` (Node.js 24+); this feature does not add new platform/runtime support.
- No paid or newly-provisioned external account is required — GitHub Packages (FR-001) reuses the same repository-scoped CI credentials already used for Docker/Helm publishing, with no new npmjs.org account/org to claim or verify.
- A 24-hour check-caching window (FR-012) is a reasonable default balancing "notices reach users promptly" against "don't make a network call on every command" — not a hard business requirement from the user.
- The update check queries the GitHub Packages registry directly via the person's existing local registry credentials (`.npmrc`) rather than an unauthenticated public endpoint or a separately-published manifest — it needs no credential of its own beyond what FR-001's install step already required them to configure.
