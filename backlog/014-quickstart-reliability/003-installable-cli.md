---
epic: 014-quickstart-reliability
feature: 003-installable-cli
status: open
dependencies: []
---

# Installable CLI

The README tells users `npx skillcanon init <project-key> <api-key>`. Neither half works for someone else today.

## Requirements

- [ ] The CLI installs without GitHub Packages auth: publish to npmjs.com (it is Apache-2.0) or document the `.npmrc` step. Today `publishConfig` is `access: restricted` on `npm.pkg.github.com`.
- [ ] README usage matches the CLI: it takes `--project-key <project page URL>` and `--api-key`, not two positional arguments.
- [ ] The SessionStart hook `init` writes (`skillcanon sync --quiet`) works when the CLI was run through `npx` and is not on `PATH`. Either write an `npx` form or have `init` warn.
- [ ] `sync` prints what it added, updated and removed, not only what it skipped.

## Acceptance Criteria

- [ ] On a machine with no prior setup, the README's CLI commands succeed verbatim against a local instance.
