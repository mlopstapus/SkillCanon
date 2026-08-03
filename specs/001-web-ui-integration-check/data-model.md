# Phase 1 Data Model: Web UI Final Composition & Integration Check

This feature adds no database schema. The "entities" below (from spec.md's Key Entities) are audit-record concepts, not persisted tables.

## Composed App Route

- **Fields**: route path, owning bounded-context feature, shell composition status (`composed` / `stale-standalone` / `not-built`)
- **Source of truth**: `src/app/(app)/**/page.tsx` and `src/app/(auth)/**/page.tsx` file existence + whether the route renders under `(app)/layout.tsx` or `(auth)/layout.tsx`

## Legacy Route Family

- **Fields**: legacy path (`legacy/frontend/src/app/**`), classification (`rebuilt` / `replaced` / `removed` / `missing`), rebuilt destination or rationale, owning epic (if missing)
- **Source of truth**: `parity-audit.md`

## Parity Finding

- **Fields**: legacy route family, classification, owner, evidence (file path or live-check result)
- **Source of truth**: `parity-audit.md` table rows

## Smoke Test Run

- **Fields**: step (team / project / policy / prompt / expansion), reachable-through-UI (bool), evidence, blocking gap (if any)
- **Source of truth**: `quickstart.md`'s Smoke Flow Results section
