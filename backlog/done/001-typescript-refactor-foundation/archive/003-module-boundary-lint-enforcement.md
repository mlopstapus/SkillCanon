---
epic: 001-typescript-refactor-foundation
feature: 003-module-boundary-lint-enforcement
status: done
dependencies: ["backlog/000-foundations/001-repo-structure-and-module-boundaries.md"]
---

# Module Boundary Lint Enforcement

Make tenet D1 ("bounded contexts own their models; no context reaches into another's internals directly") a build-breaking lint failure, not a code-review convention someone has to remember. This is what turns the `/bcs/*/CONTRACT.md` files from documentation into an actually-enforced boundary.

## Requirements

- [x] A lint rule (`eslint-plugin-boundaries`, its canonical `boundaries/dependencies` rule) configured to forbid imports from `src/bcs/<name>/` paths other than that BC's `index.ts` barrel
- [x] Rule explicitly forbids any BC importing another BC's Drizzle schema/model files directly
- [x] Rule allows `/shared/*` imports from anywhere
- [x] Violating import produces a lint error (fails `pnpm lint`), with a clear message pointing at the offending BC's `CONTRACT.md`. CI enforcement specifically depends on `004-ci-pipeline` wiring `pnpm lint` into GitHub Actions (see Acceptance Criteria below) — not yet done, since that item hasn't started.

## Acceptance Criteria

- [x] A deliberately-broken test import (BC A reaching into BC B's internal folder) fails lint with a clear error message
- [x] The same import going through BC B's barrel (`index.ts`) passes lint
- [ ] Rule is wired into the CI pipeline (`004-ci-pipeline`), not just available locally — **blocked on `004-ci-pipeline`**, which doesn't exist yet. The rule is already part of `pnpm lint`, so `004-ci-pipeline` will pick it up automatically once it wires that command into GitHub Actions; no further work is needed from this item once that happens.

## Open Questions

- None currently — this is a mechanical enforcement task once the repo structure is fixed.

## Dependencies

- `backlog/000-foundations/001-repo-structure-and-module-boundaries.md`
- `001-nextjs-app-scaffolding.md` (needs the folder structure to exist first)

## Technical Notes

Directly implements tenet D1. The tenet's own rationale is worth restating here: today's `policy_service.py` imports `Team`/`User` straight from a shared `models.py`, and that's exactly the seam that made tenant isolation hard to guarantee uniformly. This feature exists so that seam cannot reopen in the rewrite.
