---
epic: 015-distribution-correctness
feature: 002-render-includes-before-sync
status: done
dependencies: [001-governance-in-synced-file]
---

# Render Includes Before Sync

A skill whose body contains `{{ include_prompt('release-notes') }}` syncs to disk with that Nunjucks tag verbatim. `expand` renders it correctly; sync does not render it.

## Requirements

- [x] Sync writes rendered content (or, under 001 option (a), a stub with no template syntax).
- [x] No synced file ever contains `{{` or `{%` from server-side templating.

Done via 015/001 (D1): sync writes a stub with no template syntax. `e2e/cli.e2e.test.ts` asserts an including skill syncs with no `{{`/`{%` and that `skillcanon run` renders the include.
