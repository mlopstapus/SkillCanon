---
type: foundations
item: 003-testing-strategy
status: done
deliverable: context/testing-strategy.md
---

# Testing Strategy

Tenet P1 makes red-green-iterate mandatory for all new backend logic — it's the only correctness signal available, since there's still no static type checker enforcing invariants at compile time beyond what TypeScript itself catches. Tenet M3 additionally requires a specific test shape: a negative cross-tenant-access test per resource type. Both need a concrete, repeatable pattern before the first BC epic starts writing tests, since every feature file from epic 002 onward will reference this document rather than re-deriving test conventions each time.

## What We Need to Decide / Research

- Test runner and structure: Vitest for unit + integration (per the architecture doc's assumption) — confirm, and decide the file convention (`*.test.ts` colocated vs. a parallel `tests/` tree).
- What counts as a "unit" test (pure domain logic, e.g. the governance resolver's merge/priority logic with a fake team-chain) vs. an "integration" test (hits a real test Postgres instance) vs. e2e (Playwright, full HTTP/MCP round trip).
- The M3 negative-test pattern as a reusable helper: what does "assert cross-tenant access denied" look like in code — a shared test utility that spins up two orgs and asserts a 404/403 on cross-org access by ID? This needs to be built once (likely in epic 002-identity-access, since that's where the tenant model is established) and reused by every subsequent BC epic's own tenant-isolation-tests feature.
- Test database strategy: a real Postgres test container per test run (e.g. via Testcontainers) vs. a shared test schema reset between runs — matters for CI speed and RLS testing (RLS can only be meaningfully tested against a real Postgres instance, not a mock).
- What "characterization tests" look like for porting existing Python behavior (governance resolution, prompt expansion) — likely: run representative inputs through the current Python service, record expected outputs, assert the same outputs from the new TS implementation before considering the port done.

## Options / Considerations

- RLS specifically cannot be unit-tested with a mock — it needs a real Postgres connection with RLS enabled, which pushes toward Testcontainers (or an equivalent ephemeral Postgres) for integration tests rather than trying to fake tenant isolation in application-layer tests alone.
- The M3 cross-tenant helper is worth building as a shared test utility early (in epic 002) precisely because tenets D1 combined with M3 mean every one of the six subsequent BC epics needs it — building it once and reusing it is the point.

## Deliverable

`context/testing-strategy.md` — runner choice, unit/integration/e2e boundaries, the test-database approach, and a concrete example of the M3 cross-tenant-denial test pattern that other epics will copy.

## Dependencies

- `002-database-schema-and-tenancy-conventions` (RLS approach must be decided first, since it shapes how integration tests are set up)
