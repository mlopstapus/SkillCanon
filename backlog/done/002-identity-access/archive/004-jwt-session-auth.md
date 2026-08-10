---
epic: 002-identity-access
feature: 004-jwt-session-auth
status: done
dependencies: ["003-user-accounts-and-registration.md", "backlog/000-foundations/006-auth-and-session-conventions.md", "backlog/003-audit-compliance/001-audit-event-schema-and-write-path.md"]
---

# JWT Session Auth

Port login/JWT issuance from the current Python `auth_service.py`, delivered via an httpOnly cookie per the architecture session's decision, following the concrete claims/expiry/CSRF conventions from the auth foundations item.

## Requirements

- [X] Login endpoint: verifies email + password (bcrypt), issues a JWT per `context/auth-conventions.md`'s claim shape, sets it as an httpOnly cookie — delivered as `login()`, an application-layer function (matching `003-user-accounts-and-registration`'s identical precedent for its own "registration route" bullet); the actual HTTP route wiring stays owned by `backlog/008-distribution/001-rest-api-core-routes.md`, which depends on this epic completing first, not the reverse (see `specs/008-jwt-session-auth/research.md` §5)
- [X] `authenticateSession(db, cookieHeader)` contract function: validates the cookie's JWT, returns the `UserSummary` or null — signature finalized as `(db, cookieHeader)` rather than the originally-sketched `(request)`, since no Next.js request object exists at this feature's layer (research.md §3)
- [X] Logout: clears the cookie — delivered as `logout()`, same application-layer pattern as login
- [X] Startup check: app refuses to start (or loudly warns, per the decided severity) if `JWT_SECRET` is unset or at a known placeholder value — carrying forward tenet C2's requirement. Decided severity is fail-closed (refuse, not warn); delivered as `getJwtSecret()` in `src/shared/config`, mirroring `getConnectionString`'s existing pattern
- [X] Cookie flags (`httpOnly`, `secure` outside local dev, `sameSite`) match `context/auth-conventions.md` exactly

## Acceptance Criteria

- [X] Successful login sets a cookie that `authenticateSession` correctly resolves back to the same user
- [X] Invalid credentials return an auth error, no cookie set
- [X] An expired JWT is rejected by `authenticateSession`, not silently accepted
- [X] App fails to start (or logs a loud warning, per the foundations decision) when `JWT_SECRET` is missing/placeholder — verified by a boot-time test (in this codebase's established sense — a fail-closed getter checked on first use, same as `DATABASE_URL`'s; no literal process-boot hook exists anywhere yet, see research.md §2)

## Open Questions

- ~~Carried from `context/auth-conventions.md`: whether a refresh flow is added now or deferred — resolve before marking this feature done.~~ **Resolved**: no refresh flow at launch, per `context/auth-conventions.md`'s own decision, carried into `specs/008-jwt-session-auth/spec.md`'s Assumptions.

## Dependencies

- `003-user-accounts-and-registration.md`
- `backlog/000-foundations/006-auth-and-session-conventions.md`
- `backlog/003-audit-compliance/001-audit-event-schema-and-write-path.md` — new dependency, added during this feature's `/speckit-clarify` session: login/logout audit events (added scope, not in the original requirements above) needed a real audit write path, so this feature pulled that item's schema/write-path forward instead of waiting for epic 003's normal sequencing (see that item's own file and `backlog/003-audit-compliance/EPIC.md`'s Notes)

## Technical Notes

Directly implements tenet C2's "no functional insecure default" bar — the current `config.py` ships a working dev JWT secret with no check it was changed; this feature is where that gets fixed, not carried forward. Distinct and separate from `006-api-keys.md`'s bearer-key auth, which remains the mechanism for MCP/API access per `bcs/identity-access/CONTRACT.md`.

Also delivered beyond the original requirements above, resolved via `/speckit-clarify`: login (success/failure) and logout are audit-logged (`user.login`, `user.login_failed`, `user.logout` actions), closing a real SOC2/tenet-C1 gap immediately rather than deferring it. See `specs/008-jwt-session-auth/spec.md` FR-011–FR-013.

A gap discovered during implementation, not anticipated by this backlog item or the spec: email is only unique per-organization (PDR-003), not globally, so `login()` cannot assume a single-org lookup — it queries across all organizations and resolves the org from whichever account's password matches. See `specs/008-jwt-session-auth/research.md` §8.

See `specs/008-jwt-session-auth/` for the full spec/plan/research/data-model/contracts/tasks.
