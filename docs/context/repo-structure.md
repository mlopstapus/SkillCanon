# Repo Structure & Module Boundaries

**Status:** Decided
**Decided:** 2026-07-21
**Backlog item:** `backlog/000-foundations/001-repo-structure-and-module-boundaries.md`

## Decision

Each bounded context gets a flat folder under `src/bcs/<name>/`, with an `index.ts` barrel as its only public surface:

```
src/
  app/                          # Next.js routes — thin, calls into bcs/*/application only
    api/**                      # REST route handlers
    mcp/**                      # MCP tool handlers
    (app)/**                    # UI routes
  bcs/
    identity-access/
      CONTRACT.md                # public API surface, data contracts, events — governance doc, no code
      OWNERSHIP.md                # folder/DB ownership — governance doc, no code
      index.ts                  # barrel — only what CONTRACT.md lists is exported
      domain/                   # entities, value objects, invariants (tenet D2)
      application/               # use-case/service functions the barrel re-exports
      infrastructure/            # Drizzle repositories, external clients
      schema.ts                  # this BC's Drizzle schema (identity_access.*)
    governance/
    prompt-registry/
    billing-entitlements/
    audit-compliance/
    distribution/
    vcs-integration/
  shared/                        # owned by Distribution per its OWNERSHIP.md
    db/                          # Drizzle client instance, connection/pooling setup
    ui/                          # shared React components
    config/                      # env parsing, feature flag reads
    logging/                     # shared pino-based logger — see context/api-conventions.md
```

- **Shared logging:** `shared/logging` is a fourth shared module, added per `context/api-conventions.md`'s logging schema decision — every BC obtains its logger via `getLogger(bcName)` from here rather than instantiating its own. Listed separately from the original three (`db`/`ui`/`config`) because it was decided in a later foundations item; kept here so this document stays the single source of truth for `shared/`'s contents.
- **Schema location:** Drizzle schema files live inside the owning BC's folder (`bcs/governance/schema.ts`), not centralized under `shared/db/schema/`. Keeps `OWNERSHIP.md` and the file tree in sync — you can tell what a BC owns by looking at its folder, matching the DB Ownership tables in `bcs/*/OWNERSHIP.md`. The shared Drizzle client (connection, pooling) lives in `shared/db`; each BC imports it but owns its own schema.
- **Public surface:** anything exported from `bcs/<name>/index.ts` is the BC's contract, matching its `CONTRACT.md`. Anything not re-exported is implicitly private. A BC's `index.ts` should export nothing beyond what `CONTRACT.md`'s "Exposed APIs" table lists.
- **Route handlers** (`src/app/api/**`, `src/app/mcp/**`) call only into a BC's `application/` layer via its barrel — never into `domain/` or `infrastructure/` directly. This is Distribution's job per its "conformist consumer" role in `architecture.md`.
- **Path aliases:** `@/bcs/<name>` maps to `src/bcs/<name>/index.ts` (the barrel), not the folder — so a deep import (`@/bcs/governance/internal/resolver`) requires bypassing the alias entirely, making violations visually obvious in review.
- **Naming:** camelCase for functions/variables, PascalCase for types/components, kebab-case for folders and non-component files, no barrel files inside `domain/`/`application/`/`infrastructure/` (only the top-level `index.ts` is a barrel).

## Enforcement

A lint rule (ESLint `no-restricted-imports` with a pattern per BC, or `eslint-plugin-boundaries`) forbids importing anything under `bcs/<name>/{domain,application,infrastructure}/**` from outside `bcs/<name>/`. This is built in epic 001's `module-boundary-lint-enforcement` item, directly enforcing tenet D1 in CI rather than relying on review discipline alone.

## Consumed by

- Epic 001 item `nextjs-app-scaffolding` — implements this tree directly.
- Epic 001 item `module-boundary-lint-enforcement` — enforces it in CI.
