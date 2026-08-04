# CLI Command Contracts: `skillcanon`

This feature's external interface is a command-line tool, not an HTTP API — this document is the contract in place of an OpenAPI spec.

## `skillcanon init --project-key <url> [--api-key <key>]`

**Purpose**: One-time setup linking the current repository to a SkillCanon project (FR-001).

**Inputs**:
- `--project-key <url>` (required): a URL of the form `https://<host>/projects/<uuid>`, copy-pasted from the SkillCanon web UI (research.md D1). Malformed (not a URL, or missing the `/projects/<uuid>` path shape) → exit 1, clear error, nothing written.
- `--api-key <key>` (optional): if omitted, the command prompts interactively (stdin) for it, never echoing it to the terminal.

**Side effects** (idempotent — safe to re-run, FR-015):
1. Writes `.skillcanon/project.json` (`server`, `projectId` — see data-model.md).
2. Writes `.skillcanon/credentials.json` (mode `0600`, git-ignored).
3. Ensures `.gitignore` contains an entry for `.skillcanon/credentials.json` (appended once; re-running does not duplicate the line).
4. Merges a `SessionStart` hook entry into `.claude/settings.json` (research.md D6) — creates the file if absent, does not remove/duplicate an existing identical entry or clobber unrelated hooks/settings.
5. Appends a short SkillCanon blurb to `CLAUDE.md` and `AGENTS.md`, between idempotency markers (`<!-- skillcanon:start -->` / `<!-- skillcanon:end -->`), creating either file if absent. Re-running replaces only the content between the markers, never duplicates it.
6. Runs one full `sync` (see below) immediately.

**Exit codes**: `0` on success (even if the immediate sync flags individual conflicts — see `sync` below); `1` on a malformed project key, unreachable server, or rejected API key, with a clear stderr message and no partial config files left in an inconsistent state (a failed `init` before step 6 does not leave a half-written `.skillcanon/` behind — writes 1–4 are only committed once the key is confirmed to authenticate against the parsed server).

---

## `skillcanon sync [--force]`

**Purpose**: Fetch the current prompt roster and reconcile the local skill stub directory against it (FR-005, FR-006, FR-014).

**Preconditions**: `.skillcanon/project.json` and `.skillcanon/credentials.json` must exist and be readable; otherwise exit 1 with guidance to run `init` (Edge Cases).

**Behavior**:
1. `GET <server>/api/skills?projectId=<projectId>` with `Authorization: Bearer <apiKey>`.
2. For each prompt returned: derive its slug; if the local stub is missing, create it; if present and unmodified since last sync (per the Sync Record hash), update it; if present and modified since last sync (hand edit) or its slug collides with another prompt in this same response, skip it and flag it (FR-010, FR-010a) — unless `--force` is passed, in which case a hand-edited stub *is* overwritten (the only mechanism referenced by FR-010's "explicit action").
3. For every stub currently tracked in the Sync Record whose corresponding prompt is no longer in the response, remove the stub directory and its Sync Record entry (FR-006).
4. Write the updated Sync Record.

**Exit codes**: `0` on success, including when individual prompts were skipped/flagged (research.md D7) — flagged conflicts are printed to stderr, one line each, but do not fail the overall command. `1` only on a request-level failure (network unreachable, invalid/expired API key, malformed server response) — the roster is left exactly as it was before the attempt (no partial writes).

**`--quiet` variant**: identical behavior, but request-level failures (the `1`-exit case above) print a single short warning line instead of a full error, and — only when invoked as the automatic `SessionStart` trigger — never propagate a non-zero exit in a way that blocks the hook's own completion (FR-013). Manual invocation of `sync --quiet` still exits non-zero on request-level failure; only the automatic hook path swallows that exit code after printing the warning.

---

## `skillcanon run <slug> [--input '<json>']`

**Purpose**: Resolve one governed prompt live and print its content (FR-008, FR-009).

**Inputs**:
- `<slug>` (required, positional): must match a currently-known skill stub's slug.
- `--input '<json>'` (optional): a JSON object string forwarded as the expand request's `input` field; defaults to `{}` if omitted (research.md D5).

**Behavior**: `POST <server>/api/skills/<slug>/expand` with `Authorization: Bearer <apiKey>` and body `{ "input": <parsed-json-or-{}> }`. On success, prints the response's resolved prompt text to stdout, nothing else (so the output is directly usable as-is, matching the stub's "follow the output as instructions" contract).

**Exit codes**: `0` only on a successful resolution. `1` on: network failure, invalid/expired credential, a slug that no longer resolves server-side (deleted prompt), or malformed `--input` JSON — each with a distinct, human-readable stderr message and zero stdout output (FR-009; never a partial or stale print).
