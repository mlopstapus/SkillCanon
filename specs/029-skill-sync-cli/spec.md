# Feature Specification: Skill Sync CLI

**Feature Branch**: `029-skill-sync-cli`

**Created**: 2026-08-03

**Status**: Draft

**Input**: User description: "/Users/ben/repos/SpecHub/backlog/008-distribution/005-skill-sync-cli.md" — a `skillcanon` CLI, distributed separately from the main app, that keeps a connected repository's local Claude Code skills in sync with a SkillCanon project's governed prompt roster, resolving each prompt's content live (never cached) at the moment it is invoked.

## Clarifications

### Session 2026-08-03

- Q: SkillCanon is self-hosted with no single fixed server address — how does the CLI know which SkillCanon server instance to call? → A: The project key itself encodes/embeds the server URL, so setup takes one pasted artifact (project key) plus the API key, not a separately-entered server address.
- Q: When sync hits one problem prompt (a naming collision or a hand-edited stub conflict), what happens to the rest of the roster in that same run? → A: Sync skips only the conflicting prompt (flagged for the developer) and still syncs every other prompt normally.
- Q: Does a failed automatic session-start sync need a lasting, checkable trace, or is a one-time warning at that session's start sufficient? → A: A one-time warning at session start is sufficient for v1; no persistent "last sync status" surface is required.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Zero-touch skill sync after one-time setup (Priority: P1)

A developer working in a repository connected to a SkillCanon project runs a single setup command once, providing their project key (which identifies both the target SkillCanon server and the project) and API key. From that point on, every time they start a Claude Code session in that repository, their governed prompts are already available as native, invocable skills — with no further manual action, ever.

**Why this priority**: This is the entire value proposition of the feature: making governed prompts reliably invocable by an agent without requiring MCP client configuration. Without automatic, zero-touch sync, the CLI is no better than manually copying files, and the "reliable invocation" reliability goal is not met.

**Independent Test**: Can be fully tested by running the setup command once in a fresh repository, starting a new Claude Code session, and confirming that every prompt visible to the linked API key now exists as a working skill stub — with no `sync` command run by hand.

**Acceptance Scenarios**:

1. **Given** an empty repository with no prior SkillCanon connection, **When** the developer runs the setup command with a valid project key and API key, **Then** a project configuration file (safe to commit) and a separate, git-ignored credential file are created, an automatic sync trigger is installed, and an initial sync runs immediately, producing a working local skill for every prompt currently visible to that API key.
2. **Given** a repository that has already been set up, **When** the developer adds a new prompt to the SkillCanon project and then starts a new Claude Code session, **Then** the new prompt appears as a local skill with no manual sync step.
3. **Given** a repository that has already been set up, **When** a prompt is renamed or removed from the SkillCanon project and the developer starts a new Claude Code session, **Then** the local skill roster reflects the rename or removal automatically.
4. **Given** a repository that has already been set up, **When** setup completes, **Then** the repository's agent-instruction files (creating them if they don't already exist) contain a short note describing the SkillCanon integration.

---

### User Story 2 - Manual sync and direct prompt run (Priority: P2)

A developer wants to force a sync outside of session start (for example, right after making a change in SkillCanon, to verify it without restarting their session), or wants to run a specific governed prompt directly from a terminal to see its resolved output.

**Why this priority**: The automatic hook (P1) covers the common path, but developers troubleshooting, scripting, or working outside an interactive Claude Code session need direct, on-demand access to the same two operations.

**Independent Test**: Can be fully tested by running the manual sync command in an already-set-up repository and confirming the local roster updates immediately, and by running the manual run command against a known prompt slug and confirming the printed output matches what SkillCanon currently resolves for that prompt.

**Acceptance Scenarios**:

1. **Given** a set-up repository where a prompt was just changed in SkillCanon, **When** the developer runs the manual sync command, **Then** the local roster reflects the change immediately, without waiting for the next session start.
2. **Given** a set-up repository, **When** the developer runs the manual run command with a known prompt's slug, **Then** the fully resolved, governed prompt text is printed to standard output.
3. **Given** a governed prompt with a policy or objective attached, **When** that policy or objective is changed in SkillCanon and the developer immediately runs the manual run command again, **Then** the newly printed output reflects the change — no delay, no cached copy.

---

### User Story 3 - Safe failure and protection of local edits (Priority: P3)

A developer who has hand-edited a skill stub file expects that edit to survive the next sync rather than being silently discarded. A developer whose credential has expired, whose network is unavailable, or who tries to run a prompt that was since deleted expects a clear, immediate failure rather than stale or silently-wrong output.

**Why this priority**: This protects trust in the tool. Silent data loss (overwritten hand edits) or silent staleness (a governance change not actually taking effect) would each undermine the feature's core guarantee, but the primary sync/run flows in P1/P2 must exist first for this behavior to be observable at all.

**Independent Test**: Can be fully tested by hand-editing a synced stub file and running sync again (expect the edit preserved and a flag raised, not overwritten), and separately by attempting a run with a revoked credential, a deleted prompt, and no network connectivity (expect a clear non-zero-exit failure in each case, never a stale fallback).

**Acceptance Scenarios**:

1. **Given** a previously-synced skill stub file, **When** a developer hand-edits its contents and then runs sync again, **Then** the edited file is left untouched and the developer is shown a clear flag that the file differs from the tracked version, without an explicit override being passed.
2. **Given** an expired or revoked API key, **When** the developer runs the manual run command, **Then** the command exits with a non-zero status and a clear, human-readable error — no output is printed as if it succeeded.
3. **Given** a prompt slug that has since been deleted from SkillCanon, **When** the developer runs the manual run command for that slug, **Then** the command exits with a non-zero status and a clear error, rather than printing a stale previously-cached copy.
4. **Given** no network connectivity, **When** the developer runs the manual run command, **Then** the command fails loudly with a clear network-error message rather than hanging indefinitely or returning cached content.

---

### Edge Cases

- What happens when the automatic session-start sync cannot reach the server (offline, DNS failure, server down)? The session must still start; the sync failure is surfaced (e.g. a warning) but must not block or crash Claude Code startup.
- What happens when the linked project currently has zero visible prompts? Sync completes successfully with an empty local skill roster, not an error.
- What happens when two prompts, after being converted into stub folder names, would collide on the same local name? The sync must detect this and flag it rather than silently letting one stub overwrite the other, skipping only the colliding prompts while every other prompt in the same sync still updates normally.
- What happens when the setup command is run again in a repository that is already set up? It must not destroy the existing credential or duplicate the agent-instruction-file blurb; re-running is a safe, idempotent update path.
- What happens when a skill stub the CLI previously created is deleted by the user (not hand-edited, just removed)? The next sync recreates it if the corresponding prompt is still visible, without treating the deletion itself as a conflict requiring an override.
- What happens if the credential file is missing or unreadable when a sync or run is attempted? The command fails loudly with guidance to re-run setup, rather than silently skipping the operation.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a one-time setup command that accepts a project key — which identifies both the target SkillCanon server instance and the specific project — and an API key, and links the current repository to that project.
- **FR-002**: The system MUST persist the project key in a file suitable for committing to source control, and persist the API key in a separate file that is excluded from version control by default.
- **FR-003**: The system MUST never display, log, or otherwise output the API key's value, in whole or in part, from any command.
- **FR-004**: The system MUST install an automatic trigger, as part of setup, that re-syncs the local skill roster every time a Claude Code session starts in the connected repository, requiring no manual action from the developer afterward.
- **FR-005**: The system MUST retrieve the current list of prompts visible to the linked project's API key and represent each one as a locally invocable skill.
- **FR-006**: The system MUST remove a previously-synced local skill when its corresponding prompt is no longer visible to the linked API key (renamed away from, deleted, or access revoked).
- **FR-007**: The system MUST source each synced skill's name and description from the corresponding prompt's own current metadata, so that Claude Code's own skill-selection reliably picks the correct skill for a matching request.
- **FR-008**: The system MUST resolve a governed prompt's full content at the moment it is invoked, always reflecting the prompt's and its governance (policy/objective) current state — never a value cached from a prior sync.
- **FR-009**: The system MUST fail an invocation loudly — non-zero exit status and a clear, human-readable error — when the network is unavailable, the credential is invalid or expired, or the requested prompt no longer exists, and MUST NOT fall back to any previously-cached content in these cases.
- **FR-010**: The system MUST detect when a previously-synced local skill file has been modified by hand since its last sync, and MUST NOT overwrite that file automatically — it MUST instead flag the conflict and require an explicit action from the developer before proceeding.
- **FR-010a**: When a sync run encounters a conflict on one prompt (a hand-edited stub or a stub-name collision), the system MUST skip and flag only that prompt — every other prompt in the same sync run MUST still be synced normally, not blocked by the one conflict.
- **FR-011**: The system MUST, as part of setup, add a short explanatory note about the SkillCanon integration to the repository's agent-instruction files, creating any such file that does not already exist.
- **FR-012**: The system MUST scope every synced skill and every resolved prompt strictly to the single linked project's API key — a connected repository MUST NOT surface or run prompts outside that project's visibility.
- **FR-013**: The automatic session-start sync trigger MUST NOT block or fail Claude Code session startup when the sync itself cannot complete; any such failure MUST be surfaced non-fatally as a warning at that session's start. A persistent, separately-checkable "last sync status" surface is explicitly out of scope for this feature.
- **FR-014**: The system MUST provide an explicit manual sync command and an explicit manual single-prompt run command, independent of the automatic session-start trigger.
- **FR-015**: Running the setup command again in an already-set-up repository MUST be a safe, idempotent operation — it MUST NOT destroy the existing credential or duplicate the agent-instruction-file note.
- **FR-016**: The setup and sync mechanism MUST be scoped to Claude Code for this feature; supporting other IDE/agent tools is explicitly out of scope for this feature.

### Key Entities

- **Project Link**: The record, local to a repository, connecting it to one SkillCanon project — comprises a committable project key (which identifies both the target server instance and the project) and a separately-stored, non-committed API key/credential.
- **Skill Stub**: A local, developer- and Claude-Code-visible representation of one governed prompt — carries the prompt's current name/description for matching purposes, and, on invocation, resolves to the prompt's live content rather than storing that content itself.
- **Sync Record**: The local tracking of what the CLI itself last wrote for each skill stub, used to detect whether a developer has since hand-edited that stub and to avoid silently discarding that edit.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can go from "no local setup" to "governed prompts usable as Claude Code skills" using a single setup command, in under 2 minutes.
- **SC-002**: After the next Claude Code session start following setup, 100% of prompts visible to the linked API key exist as working local skills, with zero additional manual steps.
- **SC-003**: A prompt content or governance (policy/objective) change made in SkillCanon is reflected in the very next local invocation of that skill — with no observable delay and no stale intermediate result.
- **SC-004**: Removing or renaming a prompt in SkillCanon is reflected in the local skill roster after the next session start, with no manual sync step, 100% of the time.
- **SC-005**: Zero instances of API key material appear in git-tracked files or in any command's printed/logged output, across all commands and failure paths.
- **SC-006**: A developer's hand-edited skill stub file is never overwritten by an automatic or manual sync without an explicit action on the developer's part.
- **SC-007**: Every failure path (expired credential, deleted prompt, network outage) that a developer can hit while running a prompt produces a clear, actionable error and a non-zero exit status — never a silent success or stale output.

## Assumptions

- This feature is scoped to Claude Code only for v1, per the originating backlog item's own technical notes; adapters for other IDEs/agents (Copilot, Codex, etc.) are explicitly future work and out of scope here.
- The CLI's package name and publish target (npm scope, binary name) are not yet decided; per the originating backlog item, this does not block specifying the feature's behavior.
- The automatic session-start trigger is installed at the repository-local level (not the developer's global, cross-repository configuration), so that connecting a repository to SkillCanon is an explicit, per-repository opt-in rather than a machine-wide change.
- A repository links to exactly one SkillCanon project at a time in this feature; syncing skills from multiple projects into a single repository is out of scope.
- The two server-side capabilities this feature depends on — listing the prompts visible to a project's API key, and resolving one prompt's live, governed content by name — already exist as part of this codebase's REST API and are not part of this feature's own scope to build.
- "Quiet" automatic sync (per the originating backlog item's wording) means a sync failure encountered during the automatic session-start trigger is surfaced as a non-blocking warning rather than a hard error that could be mistaken for a broken Claude Code session; the explicit manual sync and run commands surface the same failures as normal command errors (non-zero exit).
- Conflict detection for hand-edited stub files (FR-010) relies on the CLI's own record of what it last wrote, not on git or filesystem timestamps, so it works correctly even in a repository that has not committed its `.claude/skills/` output.
