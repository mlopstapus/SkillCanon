---
epic: 008-distribution
feature: 002-mcp-server-and-tools
status: open
dependencies: ["backlog/002-identity-access/EPIC.md", "backlog/005-governance/EPIC.md", "backlog/006-prompt-registry/EPIC.md"]
---

# MCP Server & Tools

**Deprioritized as of the skill-sync design (`005-skill-sync-cli.md`)** — see Technical Notes. Left `status: open` because it's still valid future work if a non-skill-capable MCP client shows up wanting programmatic access, just no longer the next thing to build in this epic.

**Status check (2026-08-05):** despite being "deprioritized, not the next thing to build," this was actually built anyway — `src/app/mcp/route.ts`, `src/bcs/distribution/application/{mcp-tools.ts,mcp-session.ts}` implement all six tools, bearer auth via `authDb`, and `sh-run` does call `withAudit()`/`record()` and `recordPromptUsage()`. `specs/001-mcp-server-tools/tasks.md` shows 39/39 checked. **But**: 7 of those "done" tasks (T017/T018/T022/T023/T026/T030/T034) cite `mcp-tools.test.ts` as where sh-context/sh-run/workflow-run behavior, the audit guarantee, and the "no raw key in logs" requirement are verified — that file does not exist anywhere in this repo's git history. Only `mcp-session.test.ts` (7 tests, session state only) and `mcp-tool-characterization.test.ts` (5 tests, tool name/schema shape only) and `route.test.ts` (2 auth-rejection tests) actually run. This item stays `open` — not because the code is missing, but because this feature's own Acceptance Criteria below (characterization equivalence, the audit-event guarantee, the no-raw-key-in-logs guarantee) are unverified by test despite the tasks file's claim. Close the gap (write the missing test file, or fix the false-claim tasks.md) before ever marking this `done`.

**Update (2026-08-05) — test gap closed, and a real security bug found and fixed:** wrote `src/bcs/distribution/application/mcp-tools.test.ts` (9 Testcontainers-backed tests exercising all six tool functions against a real database — `shList`/`shSearch` return real matching results, `shContext` shows real team-scoped policies/objectives, `shRun` expands a real prompt and its audit-event guarantee is verified via a direct `select ... from audit.audit_events` query, `shWorkflowList`/`shWorkflowRun` run a real chain-kind skill, and session-context injection is verified to fire on the first call and not the second) and extended `src/app/mcp/route.test.ts` with 3 new tests (2 for the no-raw-key-in-logs guarantee via a real authenticated round trip with `_test.log` spied on, 1 regression test for the bug below).

**Critical bug found while writing the "no raw key in logs" test, not by inspection**: `route.ts`'s `handleMcpRequest` derived a caller-cache key as `transportOrResponse.sessionId ?? getSessionId(request) ?? "pending"`. The MCP SDK only assigns `transport.sessionId` *during* `.handleRequest()` (confirmed by reading `webStandardStreamableHttp.js` directly) — meaning **every brand-new session's very first (initialize) request** fell through to the literal string `"pending"`. Since `resolveMcpCaller` caches the resolved caller per session-id key (`McpSessionManager`), every such request shared the *same* cache bucket — once any one caller successfully authenticated there, **every subsequent new session's first request silently reused that cached caller instead of validating its own bearer key at all**, for the remaining lifetime of the running process. A second real user's genuinely valid key was never even checked in this state; a wrong/forged key would have been silently accepted too, as long as it arrived after any earlier successful first-session authentication. This is a real cross-tenant authentication bypass, not a theoretical one — reproduced directly by a test sending two sequential brand-new sessions' initialize requests followed by a deliberately wrong key, which returned 200 (using the first session's cached identity) before the fix and correctly 401s after it.

**Fix**: `sessionId` fallback changed from the shared literal `"pending"` to a fresh `randomUUID()` per request (route.ts already imports `randomUUID`) — each first-message request now gets its own private, never-reused cache bucket, forcing a real `authenticateApiKey` check every time no durable session id is yet established. Regression-tested in `route.test.ts`'s new "session-identity isolation across brand-new sessions" describe block.

**Known, pre-existing, out-of-scope-here side effect of the fix**: `McpSessionManager.cleanupStale()` exists but is never invoked anywhere in production code (confirmed by repo-wide grep) — no scheduled job prunes stale entries, so `mcpSessionManager`'s internal Map already grew unboundedly for real established sessions before this fix (only removed on `onsessionclosed`/`onclose`). The fix adds one additional never-reclaimed entry per new-session-establishment (previously, all such first-messages shared a single "pending" entry, which was smaller but came with the security bug above). Wiring up `cleanupStale()` on a real interval is a separate, pre-existing gap — not filed as its own backlog item yet since it's a minor resource-usage concern, not a correctness one, but worth revisiting if this server sees real sustained traffic.

Port the MCP server and all six tools from the current Python `mcp/server.py`, `mcp/session.py`, `mcp/tools.py`, using the official `@modelcontextprotocol/sdk` TS SDK running in-process in the Next.js app, per the architecture's assumption. This is a strict compatibility port — tool names and argument shapes are a public contract every connected IDE's config already depends on.

## Requirements

- [X] MCP server mounted at `/mcp`, Streamable HTTP transport, bearer-authenticated via `authenticateApiKey` — **called with `shared/db/client.ts`'s `authDb`, never the ordinary `db`** — see `backlog/002-identity-access/008-authdb-consumer-handoff.md` and `bcs/identity-access/CONTRACT.md`'s per-function notes (011-tenant-isolation-rls)
- [X] All six tools ported with identical names and argument shapes: `sh-list`, `sh-search`, `sh-context`, `sh-run`, `sh-workflow-list`, `sh-workflow-run`
- [X] Session state (resolved `userId` cache, "context already delivered" flag) implemented in-memory per process, per PDR-008 — ephemeral, safe to lose on restart. **A real bug in this exact mechanism was found and fixed while closing this item's test gap — see 2026-08-05 update below.**
- [X] `sh-run` calls `withAudit()` for every expansion — closing the gap tenet C1 explicitly calls out (current Python `sh_run` never calls `record_usage`, unlike the REST `/expand` path) — now verified by test
- [X] Session-context auto-injection (policies/objectives block on first call per session) matches current behavior exactly — verified against the TS implementation's own internal consistency (first call includes the block, second doesn't); not a byte-for-byte comparison against the legacy Python output, since no such reference harness exists

## Acceptance Criteria

- [ ] Each tool produces output equivalent to the current Python implementation for equivalent input (characterization-style comparison) — **still unverified**; the new tests prove each tool's own internal correctness against a real database, not equivalence to `mcp/tools.py`'s actual output, since no such reference/fixture exists in this repo
- [X] `sh-run` produces an audit event for every call — verified by test, closing the tenet C1 gap
- [X] No log statement in this feature includes any portion of a raw API key (tenet S3 — the specific gap called out in the tenets doc for `mcp/tools.py`) — verified by test against real log output, not just the HTTP response body
- [ ] A process restart mid-session causes at most one extra API-key validation round trip, not a broken session (per PDR-008) — still unverified; would need a test that actually restarts/reconstructs the session manager mid-flow

## Open Questions

- None — behavior fully specified by the existing Python implementation and the architecture's PDR-008 session-state decision.

## Dependencies

- All five prior bounded-context epics (002, 003, 004, 005, 006)

## Technical Notes

Per `bcs/distribution/CONTRACT.md`'s Breaking Change Policy, any deviation in tool name or argument shape from the current implementation is a breaking change to every user's existing MCP config — treat this feature as a strict compatibility port, not a redesign opportunity, even where the new architecture might suggest a cleaner tool shape. Directly closes the tenet C1 and S3 gaps the tenets document explicitly calls out by name.

**Deprioritization rationale:** `005-skill-sync-cli.md` makes governed prompts show up as native Claude Code skills via a plain REST call (`/prompts/expand/{name}`, already planned in `001-rest-api-core-routes.md`) instead of requiring the IDE to be configured as an MCP client. The reliability problem this was meant to solve — an agent deciding to call the right tool — turned out to be about invocation UX, not transport: a Skill is matched deterministically by name/description, an MCP tool call is not. For an IDE that doesn't support skills, standing up an MCP server doesn't obviously help either, since the same tool-selection reliability problem remains. This feature stays on the backlog for if/when a concrete non-skill-capable MCP client actually needs programmatic access (or for `sh-workflow-run`'s multi-step orchestration, which `005` does not attempt to replace), but `005-skill-sync-cli.md` is the priority now.
