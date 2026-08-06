---
epic: 008-distribution
feature: 008-mcp-session-cleanup-scheduling
status: open
dependencies: ["002-mcp-server-and-tools.md"]
---

# MCP Session Cleanup Scheduling

Discovered 2026-08-05 while closing `002-mcp-server-and-tools.md`'s test-coverage gap: `McpSessionManager.cleanupStale(maxAgeMs, now)` (`src/bcs/distribution/application/mcp-session.ts`) is a real, tested method (`mcp-session.test.ts` covers it directly) but is never actually invoked anywhere in production code — no scheduled job, interval, or request-path hook ever calls it. `mcpSessionManager`'s internal session Map only shrinks when a transport's `onsessionclosed`/`onclose` callback fires (a real client disconnecting cleanly); any session that never sends an explicit close (a crashed client, a dropped connection, the fresh-random-id fallback bucket the `002` fix now creates once per brand-new session) accumulates permanently for the life of the running process.

Not a correctness bug — session state itself is only ever read by session-id-keyed lookup, so a stale unused entry doesn't affect any other session's behavior. It's a slow, unbounded memory-growth concern under sustained real traffic.

## Requirements

- [ ] Call `mcpSessionManager.cleanupStale(maxAgeMs)` on a real recurring schedule (an interval timer is simplest for this single-process, in-memory, per-PDR-008-ephemeral design — no need for a distributed scheduler)
- [ ] Pick a `maxAgeMs` that comfortably exceeds any real client's expected reconnect/session-continuation window — confirm against whatever session-timeout assumption (if any) real MCP clients already make, rather than picking an arbitrary number
- [ ] Ensure the interval itself doesn't keep the Node process alive when it would otherwise exit cleanly (e.g. in tests, or a graceful shutdown path) — use `unref()` on the timer or an equivalent guard

## Acceptance Criteria

- [ ] A session with no activity for longer than the chosen `maxAgeMs` is removed from `mcpSessionManager` without any external trigger, verified by test (fake timers, not a real wait)
- [ ] An active session (activity within `maxAgeMs`) is never removed by the cleanup pass
- [ ] The cleanup interval does not prevent the process from exiting in the test/CI environment

## Open Questions

- Where should the interval actually be started — module load time in `route.ts` (simplest, but fires even in contexts that only import the module for types) vs. an explicit init call from wherever the Next.js server process boots? Confirm during implementation; this repo doesn't yet have a clear precedent for "start a background interval once per server process."

## Dependencies

- `002-mcp-server-and-tools.md`

## Technical Notes

Low priority — resource hygiene, not correctness. Revisit if this MCP server ever sees real sustained traffic; for a self-hosted, mostly-low-traffic deployment the unbounded growth is unlikely to matter in practice before a process restart happens anyway for unrelated reasons (deploys, crashes).
