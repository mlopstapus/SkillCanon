---
epic: 016-skill-feedback
feature: 001-serve-id-and-digest
status: open
dependencies: []
---

# Serve Id and Content Digest

## Requirements

- [ ] Every REST `expand`, MCP `sh-run` and CLI `run` response carries `serveId` (the usage row id), `version`, and `contentDigest` (SHA-256 of the exact composed text returned, policies included).
- [ ] `GET /api/serves/{serveId}` returns what was served (skill, version, digest, time, caller), scoped to the caller's organization.
- [ ] The CLI writes the digest into `sync-manifest.json` so drift detection and feedback can name the same text.

## Acceptance Criteria

- [ ] Two expands of an unchanged skill under unchanged policy return the same digest; adding a policy changes it.
