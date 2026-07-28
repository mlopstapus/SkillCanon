# Stubs

Tracks placeholder/incomplete implementations left in the codebase on purpose (a UI affordance wired to a no-op, a function returning fixture data, a flow deferred to a later feature) — so they don't get forgotten once real work lands on top of them.

## Convention

- When you stub something out (leave a button non-functional, hardcode a value that should come from a real source, defer a code path), add a row below in the same change.
- When a stub gets fully wired up, delete its row in the same change rather than marking it done in place — this file should only ever list what's currently stubbed, not a historical log (git history covers that).
- Each row: what's stubbed, where, why, and what finishing it requires.

## Open Stubs

| What | Where | Why stubbed | To resolve |
|------|-------|-------------|------------|
| _none yet_ | | | |
