---
type: foundations
item: 006-auth-and-session-conventions
status: done
deliverable: context/auth-conventions.md
---

# Auth & Session Conventions

The architecture session confirmed JWT-in-httpOnly-cookie for the web UI (carrying forward the current JWT approach) and unchanged scoped bearer API keys for MCP/API access. This item nails down the concrete details that weren't specified — expiry/refresh, cookie flags, CSRF — before `002-identity-access` implements the auth feature.

## What We Need to Decide / Research

- JWT claims and expiry: current backend uses `sub`/`role`/`exp` with a configurable `jwt_expiry_hours` — confirm this carries forward, decide whether `organization_id` and `team_id` should also be claims (avoids a DB lookup per request) or if the JWT stays minimal and every request re-fetches the user record.
- Refresh strategy: does an expired JWT require a full re-login, or is there a refresh token / sliding expiry? Current system has no refresh flow at all — decide whether to add one now or explicitly defer.
- Cookie flags: `httpOnly`, `secure` (true outside local dev per tenet C2), `sameSite` setting, domain scoping (matters once there's a `*.skillcanon.example` multi-tenant subdomain pattern for SaaS, if that's the eventual URL structure).
- CSRF approach: cookie-based auth needs CSRF protection that bearer-token auth didn't need — decide on double-submit cookie, `sameSite=strict`, or a CSRF token pattern, per tenet C2's "no functional insecure default" bar.
- API key scoping model: current `scopes` JSON column on `ApiKey` — confirm what scope granularity is needed (read-only vs. read-write, per-resource-type scopes) before the API key feature is built.
- Startup-time secret validation (tenet C2: "startup fails loudly if `jwt_secret` is still at its placeholder value") — confirm this check carries forward into the TS app's boot sequence.

## Options / Considerations

- `sameSite=lax` is usually sufficient CSRF mitigation for a same-origin app (frontend and API are the same Next.js app per the architecture's unified-app decision), which may make a separate CSRF token unnecessary — worth confirming against the specific route shapes (any state-changing GET requests would break this assumption).
- Minimal JWT claims (no org/team embedded) is safer against stale-claim bugs (a user's team changes, but their still-valid JWT claims the old team) at the cost of one extra DB read per request — likely the right tradeoff at this scale.

## Deliverable

`context/auth-conventions.md` — JWT claim shape and expiry, cookie flag settings, CSRF approach, API key scope model, and the startup secret-validation check.

## Dependencies

None. Must land before `002-identity-access`'s auth features start.
