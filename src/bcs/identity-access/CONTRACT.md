# Identity & Access — Contract

**Owner:** Ben Anderson
**Status:** Draft

## Purpose

Owns tenancy (`Organization`), the recursive `Team` governance hierarchy within an organization, `User` accounts, invitations, sessions, and scoped API keys. This is the context every other bounded context depends on for "who is this and what org/team are they in" — but it exposes those facts as opaque IDs and read contracts, not as raw table access.

## Connection Requirements

A consolidated, reviewer-checkable list of every identity-access function that must be called with `shared/db/client.ts`'s `authDb` (the `skillcanon_auth`-connected client) instead of the ordinary tenant-scoped `db`. Each function's row in the Exposed APIs table below carries the same note inline — this section exists so a reviewer doesn't have to reassemble the full list by hand. See `backlog/002-identity-access/008-authdb-consumer-handoff.md` for the tracking item this section satisfies.

- **`login`** — requires `authDb`. The email lookup has no organization context yet (email is only unique per-org), and RLS would otherwise deny it.
- **`authenticateSession`** — requires `authDb`. Same reason as `login`: resolves the calling user from a cookie with no organization context yet.
- **`authenticateApiKey`** — requires `authDb`. The raw-key hash lookup has no organization context yet.
- **`acceptInvitation`** — requires `authDb`. The invitation-token lookup has no organization context yet.
- **`previewInvitation`** — requires `authDb`. Same token lookup as `acceptInvitation`, just read-only (015-auth-onboarding-ui).
- **`bootstrapOrganization` / `registerFirstRunAdmin`** — requires `authDb`. No organization exists yet to scope by, and the self-hosted single-org guard needs a true cross-org count. (`createOrganization`, `bootstrapOrganization`'s internal helper, is not exported and is never callable directly — it does not need its own entry here.)
- **`logout`** — requires `authDb`. This one is easy to miss: `logout` only ever receives a bare `userId`, but it internally calls `getUser` with no organization context to resolve that user before audit-logging the logout. It reads like it needs no DB lookup at all ("already logging out, nothing to check") — which is exactly why this was the one case actually missed once already, during this function's own migration to real RLS. Treat it as its own rule, not an inference from the other five.

## Exposed APIs

| Endpoint / Method                                                                                 | Description                                                                                                                                                                                                                                                                                                                                                                                                                | Consumers                     |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `getOrganization(organizationId)`                                                                 | Org record incl. `planId` pointer                                                                                                                                                                                                                                                                                                                                                                                          | All contexts                  |
| `getUser(userId, organizationId?)`                                                                | User record (id, orgId, teamId, role, email); `organizationId` scopes the lookup and denies a cross-org id the same as a nonexistent one (M1) — omit only when no org context exists yet (011-tenant-isolation-rls)                                                                                                                                                                                                        | All contexts                  |
| `getTeamChain(organizationId, teamId)`                                                            | Ordered list: team → parent → ... → root; `organizationId` is mandatory and scopes the starting lookup (011-tenant-isolation-rls)                                                                                                                                                                                                                                                                                          | Governance                    |
| `login(db, email, password)`                                                                      | Verifies credentials (email looked up across all organizations — see 008-jwt-session-auth's research.md §8 — since email is only unique per-org), returns `{ user, cookie }` or `null`; audit-logs every attempt. **Must be called with the `skillcanon_auth`-connected client (`authDb`), not the ordinary one** — this lookup has no organization context yet and RLS (011-tenant-isolation-rls) would otherwise deny it | Distribution (route handlers), `(auth)` UI |
| `authenticateSession(db, cookieHeader)`                                                           | Resolves the calling user from a JWT carried in an httpOnly cookie (web UI) as an `AppSessionUser` including live display/team names; `null` for missing/expired/invalid sessions or a deactivated user. **Must be called with `authDb`** — same reason as `login` (011-tenant-isolation-rls)                                                                                                                              | Distribution, app shell, `(auth)` UI |
| `logout(db, userId)`                                                                              | Audit-logs the logout, returns a cookie descriptor clearing the session cookie. **Must be called with `authDb`** — internally calls `getUser` with no organization context, since it only ever receives a bare `userId` (011-tenant-isolation-rls, discovered while migrating this bounded context's tests — not part of the original four flows research.md first identified)                                             | Distribution (route handlers) |
| `bootstrapOrganization`                                                                           | Creates the tenant-root Organization plus (via the real `provisionTeamAndAdmin` callback) the root Team and admin User, atomically — self-hosted first-run only. **Must be called with `authDb`** — no organization exists yet to scope by, and the self-hosted single-org guard needs a true cross-org count (011-tenant-isolation-rls)                                                                                   | Distribution (route handlers) |
| `registerFirstRunAdmin`                                                                           | First-run registration composition: checks the entitlement gate, then calls `bootstrapOrganization` with the real `provisionTeamAndAdmin`. **Must be called with `authDb`** — same reason as `bootstrapOrganization`                                                                                                                                                                                                       | Distribution (route handlers), `(auth)` UI |
| `updateTeam(organizationId, teamId, fields, actingUser)`, `reparentTeam`, `insertTeamBetween` | Team hierarchy CRUD/reorganization — enforce same-organization and no-cycle invariants regardless of caller. `updateTeam`'s `organizationId` param is mandatory and scopes the lookup, throwing for a cross-org or nonexistent `teamId` (011-tenant-isolation-rls — this check didn't actually exist before, despite this row's own long-standing claim). `updateTeam`/`reparentTeam`/`insertTeamBetween` require an `actingUser` and are admin-only; `createTeam`'s `actingUser` is optional (admin-only when given, unrestricted when omitted — bootstrap/system callers only, e.g. `provisionTeamAndAdmin`) (019-account-team-settings-ui)                                                                   | Distribution (route handlers) |
| `listSubTeams(organizationId, parentTeamId)`, `listTeams(organizationId)`, `getTeam(organizationId, teamId)` | Read-only team-hierarchy browsing — unrestricted, no role gate. `listSubTeams` returns one level's `TeamSummary[]` (id/name/slug/parentTeamId); `listTeams` returns every team in the org flat with full `Team` detail, so a client-side tree can show any selected team without a further round-trip; `getTeam` returns one team's full detail directly, rejecting a cross-org or nonexistent id the same way (M3) (019-account-team-settings-ui)                                                                                                                          | Distribution (route handlers) |
| `createTeam`, `createUser`, `updateUser`, `deactivateUser`, `listUsers`                           | Standard write/read operations — `createUser`/`updateUser`/`deactivateUser` are admin-only (or self-or-admin for a user's own non-privileged fields); `listUsers` is org-scoped, no role restriction                                                                                                                                                                                                                       | Distribution (route handlers) |
| `inviteUser(db, actingUser, { teamId, email, role? })`                                            | Creates an invitation (org admin or the target team's owner only); best-effort emails the invite link, attempts delivery via `shared/email` (SMTP if configured, else logs); returns `{ id, token }` — the only place the raw token is ever returned (009-invitations)                                                                                                                                                     | Distribution (route handlers) |
| `acceptInvitation(db, token, { username, password, displayName? })`                               | Redeems a pending, unexpired, unrevoked invitation into a new active user scoped solely to the invitation's own org/team/role — cross-organization redemption is structurally impossible, not just checked; race-safe for concurrent accepts on the same token. **Must be called with `authDb`** — the token lookup has no organization context yet (011-tenant-isolation-rls)                                             | Distribution (route handlers), `(auth)` UI |
| `revokeInvitation(db, actingUser, invitationId)`                                                  | Cancels a pending invitation (org admin or the target team's owner only); idempotent no-op if already revoked; rejects if already accepted                                                                                                                                                                                                                                                                                 | Distribution (route handlers) |
| `listInvitations(db, actingUser)`                                                                 | Org-admin-only; lists an organization's invitations with each one's derived state (pending/accepted/expired/revoked), never the raw token                                                                                                                                                                                                                                                                                  | Distribution (route handlers) |
| `previewInvitation(db, token)`                                                                    | Read-only counterpart to `acceptInvitation` for an anonymous, pre-auth invitee: resolves a token to its derived state plus display-only `email`/`orgName`/`teamName`/`role`, or `null` for an unrecognized token — never mutates, never returns the token/id. **Must be called with `authDb`** — same token lookup as `acceptInvitation` (011-tenant-isolation-rls). Added by 015-auth-onboarding-ui so the invite-accept page can show who's being invited to what before the invitee submits anything | `(auth)` UI |
| `createApiKey(db, actingUser, { name, scopes, expiresAt? })`                                      | Creates a scoped bearer key for `actingUser`; scopes are validated structurally (`<resource>:<action>`) and capped at the creator's own role — a `"member"` may only request `:read` scopes; returns `{ id, rawKey }`, the only place the raw key is ever returned (010-api-keys). `isScopeAllowedForRole(scope, role)` (the same predicate `createApiKey` enforces server-side) is also exported directly so the issue-key UI can mirror it client-side for disabling checkboxes, rather than re-deriving the rule (019-account-team-settings-ui)                                                                                                                                          | Distribution (route handlers) |
| `authenticateApiKey(db, rawKey)`                                                                  | Resolves the presented raw key to `{ user, scopes }`, or `null` for any unrecognized/expired/revoked key or one whose owner is deactivated — never throws (010-api-keys). **Must be called with `authDb`** — the hash lookup has no organization context yet (011-tenant-isolation-rls)                                                                                                                                    | Distribution                  |
| `revokeApiKey(db, actingUser, keyId)`                                                             | Deactivates a key (self-or-admin: the key's owner, or an org admin acting on a user in their own organization); idempotent no-op if already revoked (010-api-keys)                                                                                                                                                                                                                                                         | Distribution (route handlers) |
| `listApiKeys(db, actingUser, targetUserId?)`                                                      | Lists keys for `targetUserId` (default: the caller's own); listing another user's keys requires org-admin and same-organization membership; never includes the key hash or raw value (010-api-keys)                                                                                                                                                                                                                        | Distribution (route handlers) |
| `removeTeamMember(db, actingUser, targetUserId)`                                                  | Unassigns `targetUserId` from their current team (`teamId → null`) — account stays active; org admin or the target's current team owner only; any API key the target holds stops authenticating until reassigned (`authenticateApiKey`'s existing null-`teamId` rejection); reuses the same authorization rule as `inviteUser`/`revokeInvitation` (019-account-team-settings-ui)                                          | Distribution (route handlers) |
| `listUnassignedUsers(db, actingUser)`                                                             | Org-admin-only; lists every user in the caller's org with `teamId === null` (019-account-team-settings-ui)                                                                                                                                                                                                                                                                                                                    | Distribution (route handlers) |

## Events Published

| Event                             | Payload summary                          | Consumers                                             |
| --------------------------------- | ---------------------------------------- | ----------------------------------------------------- |
| `OrganizationCreated`             | orgId, name, createdBy                   | Billing (provisions default Plan/Entitlement)         |
| `UserJoined`                      | orgId, userId, teamId                    | Audit                                                 |
| `TeamCreated` / `TeamReparented`  | orgId, teamId, parentTeamId              | Governance (invalidates any cached resolution), Audit |
| `ApiKeyCreated` / `ApiKeyRevoked` | orgId, userId, keyId (never the raw key) | Audit                                                 |

## Events Consumed

| Event                 | From BC                | What this BC does with it                                                                                                                                                                               |
| --------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SubscriptionUpdated` | Billing & Entitlements | Nothing directly — Identity never gates its own writes on entitlements itself; callers (Distribution) check entitlements before calling Identity's write APIs (e.g. "can this org create another team") |

## Data Contracts

```ts
type OrganizationId = string; // uuid
type UserId = string;
type TeamId = string;

interface OrgSummary {
  id: OrganizationId;
  name: string;
  slug: string;
  planId: string;
}
interface UserSummary {
  id: UserId;
  orgId: OrganizationId;
  teamId: TeamId | null; // null once removed from a team (019-account-team-settings-ui) — "unassigned," not deactivated
  role: "admin" | "member";
  email: string;
}
interface AppSessionUser extends UserSummary {
  displayName: string;
  teamName: string | null; // null exactly when teamId is null
}
interface TeamChainEntry {
  id: TeamId;
  name: string;
  parentTeamId: TeamId | null;
}
interface InvitationSummary {
  id: string;
  email: string;
  teamId: TeamId;
  role: "admin" | "member";
  state: "pending" | "accepted" | "expired" | "revoked";
  createdAt: Date;
}
```

No other context receives a raw `User`/`Team`/`Organization` row — only these summary shapes.

## Stability Guarantees

`OrganizationId`, `UserId`, `TeamId` are stable UUIDs, never reused. `getTeamChain` ordering (self-first, root-last) will not change without a major version bump — Governance's resolution correctness depends on it. `AppSessionUser` is a presentation-safe session view: it never includes password hashes, raw session material, or inactive-user access.

Web UI auth carries forward the current JWT approach (HS256, `sub`/`role`/`exp` claims) rather than switching to opaque server-side sessions, delivered via an httpOnly cookie instead of a client-managed header. Scoped bearer API keys remain the separate, unchanged mechanism for MCP/API access.

## Breaking Change Policy

Any change to the shapes above, or to team-chain ordering, requires updating this file in the same commit and is called out explicitly in the PR description.
