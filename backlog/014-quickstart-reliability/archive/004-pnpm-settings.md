---
epic: 014-quickstart-reliability
feature: 004-pnpm-settings
status: done
dependencies: []
---

# Move pnpm Settings Out of package.json

pnpm warns that it ignores the `pnpm.overrides` and `pnpm.auditConfig` keys in `package.json`. The CLI's install ran on pnpm 11.19, which reads them from `pnpm-workspace.yaml` instead. If those overrides are security pins, they are silently not applied for anyone on a newer pnpm.

## Requirements

- [x] Move `overrides` and `auditConfig` to `pnpm-workspace.yaml` (or pin pnpm and enforce it with `packageManager` + corepack in CI).
- [x] Confirm the lockfile resolves the overridden versions after the move.
