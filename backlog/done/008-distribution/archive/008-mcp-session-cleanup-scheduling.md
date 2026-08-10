---
epic: 008-distribution
feature: 008-mcp-session-cleanup-scheduling
status: done
dependencies: ["002-mcp-server-and-tools.md"]
---

# MCP Session Cleanup Scheduling

Discovered 2026-08-05 while closing `002-mcp-server-and-tools.md`'s test-coverage gap: `McpSessionManager.cleanupStale(maxAgeMs, now)` (`src/bcs/distribution/application/mcp-session.ts`) is a real, tested method (`mcp-session.test.ts` covers it directly) but is never actually invoked anywhere in production code — no scheduled job, interval, or request-path hook ever calls it. `mcpSessionManager`'s internal session Map only shrinks when a transport's `onsessionclosed`/`onclose` callback fires (a real client disconnecting cleanly); any session that never sends an explicit close (a crashed client, a dropped connection, the fresh-random-id fallback bucket the `002` fix now creates once per brand-new session) accumulates permanently for the life of the running process.

Not a correctness bug — session state itself is only ever read by session-id-keyed lookup, so a stale unused entry doesn't affect any other session's behavior. It's a slow, unbounded memory-growth concern under sustained real traffic.

## Requirements

- [X] Call `mcpSessionManager.cleanupStale(maxAgeMs)` on a real recurring schedule — `startMcpSessionCleanup(sessionManager, options)` (`src/bcs/distribution/application/mcp-session.ts`) wraps a plain `setInterval`, no distributed scheduler needed
- [X] Pick a `maxAgeMs` that comfortably exceeds any real client's expected reconnect/session-continuation window — no MCP client documents a specific session-timeout assumption to confirm against (checked; there isn't one), so picked `DEFAULT_MCP_SESSION_MAX_AGE_MS = 24h` (swept every `DEFAULT_MCP_SESSION_CLEANUP_INTERVAL_MS = 1h`) as a conservative bound for a self-hosted, interactive dev tool — see the reasoning comment above the constant
- [X] Ensure the interval itself doesn't keep the Node process alive when it would otherwise exit cleanly — `startMcpSessionCleanup` calls `.unref()` on the returned timer; verified by test

## Acceptance Criteria

- [X] A session with no activity for longer than the chosen `maxAgeMs` is removed from `mcpSessionManager` without any external trigger, verified by test (fake timers, not a real wait) — `mcp-session.test.ts`
- [X] An active session (activity within `maxAgeMs`) is never removed by the cleanup pass — `mcp-session.test.ts`
- [X] The cleanup interval does not prevent the process from exiting in the test/CI environment — verified by asserting `.hasRef() === false` on the real underlying `NodeJS.Timeout` (a genuine unref check, not just an inference from fake-timer count)

## Open Questions

- ~~Where should the interval actually be started~~ — resolved: module load time in `route.ts`, the simpler of the two options. The stated concern (firing "even in contexts that only import the module for types") doesn't apply in practice — nothing in this codebase imports `route.ts` for types alone; `route.test.ts` imports it for real execution (`_test`) anyway, so it already needed to tolerate the module's side effects.

## Resolution (2026-08-09)

`startMcpSessionCleanup(sessionManager, options)` added to `src/bcs/distribution/application/mcp-session.ts`, exported from the BC barrel, and called once at module load in `src/app/mcp/route.ts`. `mcp-session.test.ts` covers all three Acceptance Criteria with fake timers (sweep removal, active-session survival) plus one real-timer test asserting the underlying `setInterval` handle's `.hasRef()` is `false`. All Acceptance Criteria checked; `pnpm vitest run src/bcs/distribution src/app/mcp` (37 tests), `pnpm typecheck`, and `pnpm lint` all pass.

## Dependencies

- `002-mcp-server-and-tools.md`

## Technical Notes

Low priority — resource hygiene, not correctness. Revisit if this MCP server ever sees real sustained traffic; for a self-hosted, mostly-low-traffic deployment the unbounded growth is unlikely to matter in practice before a process restart happens anyway for unrelated reasons (deploys, crashes).
