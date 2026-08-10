---
epic: 002-identity-access
feature: 006-api-keys
status: done
dependencies: ["003-user-accounts-and-registration.md", "backlog/000-foundations/006-auth-and-session-conventions.md"]
---

# API Keys

Port scoped bearer API keys from the current Python `apikey_service.py` — the auth mechanism for MCP and REST API access outside the browser session, used by every IDE connecting to a SkillCanon instance.

## Requirements

- [X] `identity_access.api_keys` table: `id`, `organization_id`, `user_id`, `name`, `key_hash` (SHA-256), `prefix` (short, displayable), `scopes` (jsonb), `expires_at` (nullable), `is_active`, `created_at`, `last_used_at`
- [X] Key generation: raw key shown exactly once at creation, only the hash + prefix stored thereafter
- [X] `authenticateApiKey(rawKey)` contract function: hashes the presented key, looks it up, returns `UserSummary` + scopes, or null
- [X] Revoke key (sets `is_active = false`)
- [X] `last_used_at` updated on successful authentication (matches current behavior)

## Acceptance Criteria

- [X] Raw key is never retrievable after creation — verified by a test asserting no API response or DB column contains it in reversible form
- [X] An expired or revoked key fails authentication
- [X] `authenticateApiKey` correctly resolves the key's owning organization and user

## Open Questions

- Scope granularity — resolved by `context/auth-conventions.md`; implement whatever that document specifies. **Resolved**: implemented as structural `<resource>:<action>` validation (not a closed enum) per this feature's own `/speckit-clarify` session — see spec.md Clarifications and research.md §1.

## Dependencies

- `003-user-accounts-and-registration.md`
- `backlog/000-foundations/006-auth-and-session-conventions.md`

## Technical Notes

Directly implements tenet S1 (hashed at rest) and closes the tenet S3 gap explicitly called out in the tenets doc: the current `mcp/tools.py` logs `api_key_raw[:12]` at debug level — this feature's logging must not reproduce that. No log statement anywhere in this feature (or any caller of `authenticateApiKey`) may include any portion of the raw key.

Implemented in `specs/010-api-keys/`. Two design decisions beyond this backlog item's original text, both settled via `/speckit-clarify` and documented in research.md:

1. **Scope validation is structural, not a closed enum.** A scope must match `<resource>:<action>` (action ∈ `read`/`write`/`run`), but the resource half isn't checked against any registry — `identity-access` doesn't own or import other bounded contexts' resource definitions, and none of those contexts (`prompt-registry`, `workflow-orchestration`, `governance`) have code in the new TypeScript scaffold yet.
2. **A key's granted scopes are capped at its creator's own role at creation time.** Since this codebase has no per-resource permission matrix yet, the cap maps onto the only privilege axis that exists: `"admin"` may request any well-formed scope, `"member"` may request only `:read` scopes. The cap is enforced once, at creation — a later role change does not retroactively narrow an already-issued key's scopes (spec.md Edge Cases).

`createApiKey`/`authenticateApiKey`/`revokeApiKey`/`listApiKeys` are application-layer functions only (`src/bcs/identity-access/{domain,application,infrastructure}`) — no REST route or UI page ships as part of this feature, matching this epic's established precedent (`007`, `008`, `009`). Raw-key-never-logged (FR-011) is now covered by an explicit regression test (`create-api-key.test.ts`), not just satisfied by omission.
