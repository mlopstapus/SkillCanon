# Contract: Teams, Users, API Keys (identity-access)

All endpoints require auth per `error-shape.contract.md`. `organizationId` is always the resolved caller's own — never accepted from the request.

| Method | Path | BC call | Notes |
|---|---|---|---|
| POST | `/api/teams` | `createTeam(tx, params, { actingUser })` | Admin-only (enforced by `createTeam` itself) |
| GET | `/api/teams` | `listTeams(tx, orgId)` | Paginated (`page`/`pageSize`, FR-015); query `parentTeamId?` filters client-side; `flat?` reserved, currently always flat |
| GET | `/api/teams/{teamId}` | `getTeam(tx, orgId, teamId)` | 404-shaped `TeamNotFound`-equivalent if cross-org (RLS makes it invisible) |
| PUT | `/api/teams/{teamId}` | `updateTeam(orgId, teamId, fields, actingUser)` | Owner/parent-owner authorization inside `updateTeam` |
| DELETE | `/api/teams/{teamId}` | not exposed by `identity-access` today | **Not implemented** — no `deleteTeam` BC function exists; omitted rather than inventing one (see plan.md Complexity Tracking is silent here because this is a pre-existing BC gap, not a route-layer decision — flagged in tasks.md instead) |
| POST | `/api/teams/{teamId}/insert-parent` | `insertTeamBetween(tx, { organizationId, name, slug, childTeamId: teamId, actingUser })` | Admin-only |
| POST | `/api/teams/{teamId}/reparent` | `reparentTeam(tx, teamId, newParentTeamId, actingUser)` | Admin-only; body `{ newParentTeamId }`. `updateTeam` explicitly excludes hierarchy changes — this is a separate route, not folded into `PUT /api/teams/{teamId}` |
| POST | `/api/users` | `createUser(tx, params)` | Admin-only (enforced internally) |
| GET | `/api/users` | `listUsers(tx, orgId)` | Paginated (`page`/`pageSize`, FR-015); query `teamId?` filters client-side |
| GET | `/api/users/{userId}` | `getUser(userId, orgId)` | |
| PUT | `/api/users/{userId}` | `updateUser(userId, fields)` | |
| DELETE | `/api/users/{userId}` | `deactivateUser(userId)` | Admin-only; `LastActiveAdminError` guards the last-admin case |
| POST | `/api/users/{userId}/api-keys` | `createApiKey(tx, actingUser, { name, scopes, expiresAt? })` | Self-or-admin; response includes one-time `rawKey` |
| GET | `/api/users/{userId}/api-keys` | `listApiKeys(tx, actingUser, userId)` | Self-or-admin; never returns hash/raw value |
| DELETE | `/api/api-keys/{keyId}` | `revokeApiKey(tx, actingUser, keyId)` | Self-or-admin |

**Team deletion**: the legacy Python API exposed `DELETE /teams/{id}`, but no `identity-access` application function performs a team deletion today (only create/update/reparent/insert-between). Per this feature's constraint of calling only what's already exposed (constitution D1/D2), this endpoint is **not ported** — recorded as an explicit gap in `tasks.md`, not silently dropped.

**Not-found error shape**: `getTeam`/`updateTeam`/`insertTeamBetween`/`reparentTeam`/`getUser` throw a bare, untyped `Error` for "not found" (no `TeamNotFoundError`/`UserNotFoundError` class exists in `identity-access`) — a pre-existing BC-layer inconsistency versus every other resource's registered `*NotFoundError` classes. Routes calling these five functions catch and convert to `TEAM_NOT_FOUND`/`USER_NOT_FOUND` explicitly (see `data-model.md`'s `notFoundResponse` section and `research.md`'s three-shapes decision) rather than letting it fall through to the generic 500 fallback.
