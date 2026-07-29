# Contract: Audit Log UI

This feature has no external (customer-facing) HTTP API — it's a server-rendered settings page. Its "contracts" are (a) the URL query-parameter interface between the page's server and client halves, (b) the new application-layer getter functions added to existing bounded contexts, and (c) the access-control contract enforced server-side.

## Access control contract

- **Route**: `GET /settings/audit-log` (page), plus any server actions the page's client components call for filter-driven re-fetches.
- **Requirement**: The requesting session's user MUST have `role === "admin"` in the organization resolved from their session. Any other case (`role === "member"`, no session at all) MUST be denied before any audit event data is read — matching FR-001/FR-016 and SC-004 (100% of non-admin attempts blocked, UI and server-side alike).
- **Enforcement point**: `page.tsx` (server component) checks `authenticateSession()`'s returned user's role immediately after auth, before calling `listAuditEvents`; `redirect()`s non-admins away (to `/dashboard`, matching this app's existing redirect-away convention for other access-denied cases, e.g. `teams/page.tsx`'s `user.teamId === null` case). Any server action the client re-fetch path calls MUST repeat this same check independently — the client component must never be the only place the gate exists, since FR-016 requires server-side rejection regardless of what the UI shows.

## URL query-parameter contract (page ⇄ its own client components)

`GET /settings/audit-log?q=&resource=&actorUserId=&actorApiKeyId=&transport=&range=&from=&to=&page=`

| Param | Type | Meaning |
|---|---|---|
| `q` | string | Free-text search (action/resource/actor) |
| `resource` | string | One of the org's real `resourceType` values, or omitted for "all" |
| `actorUserId` | string (uuid) | Mutually exclusive with `actorApiKeyId` |
| `actorApiKeyId` | string (uuid) | Mutually exclusive with `actorUserId` |
| `transport` | `"web"\|"api"\|"cli"\|"system"` | Transport filter |
| `range` | `"24h"\|"7d"\|"30d"\|"all"\|"custom"` | Date-range preset; `"custom"` requires `from`/`to` |
| `from`, `to` | ISO date string | Only read when `range=custom` |
| `page` | integer, 1-based | Pagination cursor |

`page.tsx` parses these from `searchParams`, maps them onto `AuditEventFilters` (unchanged, existing shape), and calls `listAuditEvents`. The client `filter-bar.tsx` component updates the URL (`router.replace`) on every filter change rather than holding filters in component-only state (research.md's "Filter state persistence" decision) — this is the load-bearing contract between server and client halves, not an implementation detail: any new filter dimension added in the future must be added to this table.

## New getter function contracts

See `data-model.md`'s "New getter contracts" section for full signatures. Summary of the contract obligations each new getter takes on (matching every existing sibling getter's already-established convention in the same BC):

1. **Org-scoped**: every new getter accepts `organizationId` and scopes its lookup by it — a cross-org id MUST behave identically to a nonexistent one (never a distinguishing error), matching this codebase's established cross-org-denial-equals-not-found convention (M3).
2. **Null, not throw, on not-found**: `getInvitation`/`getApiKeySummary`/`getPromptById`/`getPromptVersion` all return `null` for a not-found/cross-org id — never throw — since a resolver caller (`resolveResourceDisplayName`) must treat "not found" as an ordinary, expected fallback case (a deleted resource), not an exception path.
3. **No new fields exposed**: each new getter returns the same already-existing summary type its BC already uses elsewhere (`InvitationSummary`, `ApiKeySummary`, `PromptSummary`, `PromptVersionSummary`) — no new type is introduced, and no sensitive field (e.g. a raw invitation token, a key hash) is added to what these types already expose.
4. **Barrel + CONTRACT.md updated together**: each new getter is exported from its BC's `index.ts` and documented in that BC's `CONTRACT.md` "Exposed APIs" table in the same change, per this repo's established convention for keeping the two in sync.

## Redaction contract (inherited, not modified)

This feature never re-implements redaction. `record()`'s existing behavior (stripping `password_hash`/`passwordHash`/`key_hash`/`keyHash`/`token`/`raw_token`/`rawToken`/`jwt` from `before`/`after` before storage) is the only redaction mechanism; the detail drawer renders whatever `before`/`after` it receives as-is. FR-010/SC-002 are satisfied by construction (the diff view has no code path that could reintroduce a stripped field) and are verified by a test asserting the rendered diff for an event with a redacted key never contains the pre-redaction raw value.
