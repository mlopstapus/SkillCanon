---
epic: 015-distribution-correctness
feature: 002-render-includes-before-sync
status: open
dependencies: [001-governance-in-synced-file]
---

# Render Includes Before Sync

A skill whose body contains `{{ include_prompt('release-notes') }}` syncs to disk with that Nunjucks tag verbatim. `expand` renders it correctly; sync does not render it.

## Requirements

- [ ] Sync writes rendered content (or, under 001 option (a), a stub with no template syntax).
- [ ] No synced file ever contains `{{` or `{%` from server-side templating.
