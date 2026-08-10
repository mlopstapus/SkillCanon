---
type: foundations
item: 001-repo-structure-and-module-boundaries
status: done
deliverable: context/repo-structure.md
---

# Repo Structure & Module Boundaries

The architecture defines seven bounded contexts communicating only through their `CONTRACT.md`-defined APIs (tenet D1). That rule is only real if the code layout makes a violation visible immediately — in a review, or better, in CI — rather than relying on everyone remembering not to `import` another context's internals. This item turns the `/bcs/` documentation convention into an actual, enforced `src/` tree.

## What We Need to Decide / Research

- Concrete `src/` layout: does each BC get `src/bcs/<name>/{domain,application,infrastructure}` or a flatter structure? Where do Drizzle schema files live relative to the BC that owns them?
- How `/shared/` (owned by Distribution per its OWNERSHIP.md) is physically laid out — `shared/db`, `shared/ui`, `shared/config` per the architecture doc.
- Where route handlers (`src/app/api/**`, `src/app/mcp/**`) live relative to the BC application-service layer they call into.
- Naming conventions: file naming, export conventions (barrel files or not), how a BC's public contract (the functions listed in its `CONTRACT.md`) is distinguished in code from its private internals.
- Whether path aliases (`@/bcs/governance`, etc.) are used, and how they map to enforce "only import the contract module, not internals."

## Options / Considerations

- Flat `src/bcs/<name>/` with an `index.ts` barrel exporting only contract functions is the simplest way to make "this is the public surface" visible — anything not re-exported from `index.ts` is implicitly private, and a lint rule can forbid deep imports past the barrel (`bcs/governance/internal/*` from outside the folder).
- Consider whether Drizzle schema per BC lives inside that BC's folder (`bcs/governance/schema.ts`) or centralized (`shared/db/schema/`) — inside-the-BC keeps ownership visible in the file tree, matching OWNERSHIP.md; centralized is more conventional Drizzle usage. Lean toward inside-the-BC to keep OWNERSHIP.md and the file tree in sync.

## Deliverable

`context/repo-structure.md` — the concrete folder tree, naming rules, and the barrel-export convention that item 001 of epic 001 (`nextjs-app-scaffolding`) will implement directly, and that item 003 of epic 001 (`module-boundary-lint-enforcement`) will enforce in CI.

## Dependencies

None. Can start immediately — draws directly on `bcs/*/OWNERSHIP.md` and `bcs/*/CONTRACT.md`, both already written.
