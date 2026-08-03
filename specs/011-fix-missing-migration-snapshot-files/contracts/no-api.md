# Contracts: No Runtime API

This feature introduces no REST route, MCP tool, UI action, service contract, or entitlement-gated runtime surface.

The observable contract is repository hygiene:

- Every `drizzle/migrations/NNNN_*.sql` file has a matching `drizzle/migrations/meta/NNNN_snapshot.json`.
- Historical SQL migrations and `_journal.json` ordering remain unchanged.
- `pnpm db:generate` diffs from the complete current snapshot history and does not emit already-applied historical DDL.
