# Data Model: Skill Sync CLI

All data described here is local to the developer's machine/repository — this feature introduces no new server-side tables or columns (see research.md's context notes).

## Project Link

Persisted at `.skillcanon/project.json` (committed to source control).

| Field | Type | Notes |
|---|---|---|
| `server` | string (URL origin) | Extracted from the project-key URL's origin at `init` time. Used as the base for every subsequent API call. |
| `projectId` | string (UUID) | Extracted from the project-key URL's path. Sent as `?projectId=` on the list call and used to scope which prompts are synced. |

Identity/uniqueness: exactly one `Project Link` per repository (this feature's scope, per spec Assumptions — no multi-project fan-out). Re-running `init` overwrites this file's values idempotently (FR-015), it does not append or duplicate.

## Credential

Persisted at `.skillcanon/credentials.json` (git-ignored, `0600` permissions).

| Field | Type | Notes |
|---|---|---|
| `apiKey` | string | Raw API key value. Never logged, printed, or included in any error message (FR-003) — even in a stack trace or debug flag. |

Lifecycle: written once by `init`; overwritten in place by re-running `init` with a new key; read (never written) by `sync` and `run`. Missing/unreadable file is a hard, loud failure (Edge Cases).

## Skill Stub

One per governed prompt visible to the linked project, at `.claude/skills/skillcanon-<slug>/SKILL.md`.

| Field | Type | Notes |
|---|---|---|
| `slug` | string | Derived from the prompt's name (lowercased, kebab-cased). Forms the stub's directory name (`skillcanon-<slug>`) and is the argument `skillcanon run <slug>` expects. |
| `name` (frontmatter) | string | Sourced verbatim from the prompt's current metadata (FR-007) — updated on every sync if it changed upstream. |
| `description` (frontmatter) | string | Sourced verbatim from the prompt's current metadata — same update rule as `name`. |
| body | fixed template | One-line instruction: run `skillcanon run <slug>` and follow the output as instructions. Not sourced from the prompt — identical across every stub. |

Lifecycle / state transitions:
- **Created** when a prompt first appears in the linked project's visible roster.
- **Updated** (name/description only, body never changes) when the upstream prompt's metadata changes.
- **Removed** when the prompt is no longer visible to the linked API key (deleted, renamed away — old slug gone, access revoked).
- **Skipped** (left untouched, flagged) when the CLI's own Sync Record shows the file's current on-disk content no longer matches what the CLI itself last wrote (a hand edit), or when its slug collides with another prompt's derived slug in the same sync run (FR-010, FR-010a).
- **Recreated** normally (not treated as a conflict) if a developer deletes a stub file outright — the sync record has no "last written hash" to compare against a modification, only an absence, so it's treated as "needs (re)creation," not a conflict (Edge Cases).

Identity/uniqueness: `slug` (and therefore the stub's directory name) must be unique within one sync run's output; a collision is a flagged, skip-only-that-pair conflict (FR-010a), not a whole-sync failure.

## Sync Record

Persisted at `.skillcanon/sync-manifest.json` (committed — contains only non-secret content hashes).

| Field | Type | Notes |
|---|---|---|
| `stubs` | map of relative stub path → sha256 hex digest | One entry per currently-tracked stub, recording the hash of exactly what the CLI itself last wrote for that file. Compared against the file's current on-disk content at the start of every sync to detect a hand edit (drift). Entry removed when its stub is removed. |

## Relationships

```
Project Link (1) ──identifies server+project for──> every API call sync/run makes
Credential (1) ──authenticates──> every API call sync/run makes
Sync Record (1) ──tracks last-known-good state of──> many Skill Stubs (0..n)
```

No entity here has a foreign key into the main application's database — all correlation to a SkillCanon project/prompt happens implicitly, by calling the already-authenticated, already-org/project-scoped REST routes and trusting their response shape.
