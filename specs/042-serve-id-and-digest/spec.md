# Feature Specification: Serve Id and Content Digest

**Feature Branch**: `feat/serve-id-and-digest`
**Created**: 2026-10-30
**Source**: `backlog/016-skill-feedback/001-serve-id-and-digest.md` (epic 016, first feature; 002/003 depend on it)

## User Scenarios & Testing

### User Story 1 - Name exactly what was served (P1)
A person or agent runs a skill and gets back, alongside the text, an id for that serve, the version served and a digest of the exact text, so later feedback can refer to "this text".

1. **Given** a skill, **When** it is expanded over REST, MCP `sh-run`, or CLI `run`, **Then** the response carries `serveId`, `version`, `contentDigest`.
2. **Given** an unchanged skill and unchanged policy, **When** expanded twice, **Then** the digest is identical and the serve ids differ.
3. **Given** the same skill, **When** a policy is added, **Then** the digest changes.

### User Story 2 - Look up a serve (P1)
`GET /api/serves/{serveId}` returns skill, version, digest, time and caller. A serve from another organization is indistinguishable from a missing one (404).

### User Story 3 - CLI remembers the last serve (P2)
`skillcanon run <slug>` records its serve in `.skillcanon/sync-manifest.json` so a later feedback command (016/002) and drift checks name the same text. `sync` preserves those entries.

## Requirements
- **FR-001** `contentDigest` = lowercase hex SHA-256 of the exact composed `content` returned (policies included).
- **FR-002** The serve id is the `distribution.prompt_usage` row id; the digest is stored on that row (new nullable column).
- **FR-003** `expand()` itself never records usage; only the genuine-serving layers do (existing invariant).
- **FR-004** REST expand adds `serveId`, `version`, `contentDigest` to its body. MCP `sh-run` appends a `[Serve <id> · version <v> · digest <hex>]` line. CLI `run` keeps stdout = content only (the synced stub pipes it to the agent) and prints the serve line to stderr.
- **FR-005** `GET /api/serves/{serveId}` is org-scoped; unknown/cross-org -> 404 `SERVE_NOT_FOUND`.
- **FR-006** CLI manifest gains `serves: { slug: { serveId, version, contentDigest } }`; `sync` neither drops nor needs it.

## Assumptions
- Failed serves (status 500) get a usage row with no digest; no serve id is returned for them.
- Chain runs are out of scope (chain steps are not `expand`ed text).
- `sync` writes stubs, not served text, so it cannot compute a digest without counting as a serve; the manifest digest therefore comes from `run`.
- Pre-existing usage rows have a null digest.
