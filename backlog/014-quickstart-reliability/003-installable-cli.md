---
epic: 014-quickstart-reliability
feature: 003-installable-cli
status: open
dependencies: []
---

# Installable CLI

The README tells users `npx skillcanon init <project-key> <api-key>`. Neither half works for someone else today.

## Requirements

- [x] The CLI installs without GitHub Packages auth: publish to npmjs.com (it is Apache-2.0) or document the `.npmrc` step. Today `publishConfig` is `access: restricted` on `npm.pkg.github.com`. (D3: stays on GitHub Packages; the registry and token step is documented in both READMEs. No npm publish.) (#101)
- [x] README usage matches the CLI: it takes `--project-key <project page URL>` and `--api-key`, not two positional arguments. (#101)
- [x] The SessionStart hook `init` writes (`skillcanon sync --quiet`) works when the CLI was run through `npx` and is not on `PATH`. Either write an `npx` form or have `init` warn. (#101)
- [x] `sync` prints what it added, updated and removed, not only what it skipped. (#101)

## Acceptance Criteria

- [ ] On a machine with no prior setup, the README's CLI commands succeed verbatim against a local instance.

Left open: the acceptance criterion needs a published package and a tester's read:packages token, which this session could not verify. Tick it after someone runs the README's install and init commands on a clean machine.
