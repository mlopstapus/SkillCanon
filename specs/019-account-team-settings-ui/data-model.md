# Data Model: Account & Team Settings UI

All entities already exist in `identity_access` (see `src/bcs/identity-access/infrastructure/schema.ts`). This feature makes exactly one schema change and adds two read/write shapes on top of existing tables — no new tables.

## Schema change

### `identity_access.users.team_id`: `NOT NULL` → nullable

```diff
- teamId: uuid("team_id").notNull().references(() => teams.id),
+ teamId: uuid("team_id").references(() => teams.id),
```

Migration named `<timestamp>_identity_access_users_team_id_nullable` per `docs/context/database-conventions.md`'s naming convention. No data backfill needed (existing rows already have a real `team_id`; the column just stops rejecting `NULL` going forward). The FK constraint itself (`references(() => teams.id)`) is unaffected — a `NULL` value trivially satisfies a foreign key.

No RLS policy change — `users`' tenant isolation is keyed on `organization_id`, not `team_id`; an unassigned user still belongs to their organization.

## Entities (from spec's Key Entities)

### Team

Unchanged shape (`identity_access.teams`): `id`, `organizationId`, `name`, `slug` (unique per `organizationId`), `description`, `ownerId` (nullable FK → `users.id`), `parentTeamId` (nullable self-FK), `createdAt`/`updatedAt`.

### Team Member (a `User` row, viewed team-scoped)

Unchanged shape (`identity_access.users`) except the schema change above. `teamId` is now `TeamId | null`. A "member" in the UI sense is any `users` row where `teamId` equals the team currently being viewed.

### Unassigned (orphaned) User

Not a new table — the same `users` row, `teamId IS NULL`. New read path: `listUnassignedUsers`.

### Invitation

Unchanged (`identity_access.invitations`) — already used by `inviteUser`/`revokeInvitation`/`listInvitations`.

### API Key

Unchanged (`identity_access.api_keys`) — already used by `createApiKey`/`listApiKeys`/`revokeApiKey`. `authenticateApiKey` gains one new rejection condition (owner's `teamId IS NULL`), no shape change.

## Data contract changes (`src/bcs/identity-access/CONTRACT.md`)

Per the Breaking Change Policy, both are updated in the same commit as the schema change:

```diff
 interface UserSummary {
   id: UserId;
   orgId: OrganizationId;
-  teamId: TeamId;
+  teamId: TeamId | null;
   role: "admin" | "member";
   email: string;
 }
 interface AppSessionUser extends UserSummary {
   displayName: string;
-  teamName: string;
+  teamName: string | null;
 }
```

New rows in the Exposed APIs table:

| Endpoint / Method | Description | Consumers |
|---|---|---|
| `removeTeamMember(db, actingUser, targetUserId)` | Unassigns a user from their current team (org admin or that team's owner only); the user's account remains active, but `teamId` becomes `null` and any API key they hold stops authenticating until reassigned | Distribution (route handlers) |
| `listUnassignedUsers(db, actingUser)` | Org-admin-only; lists users in the caller's organization with `teamId IS NULL` | Distribution (route handlers) |

Existing rows updated in place: `createTeam` gains an optional `actingUser` in its options (admin-only when present, unrestricted when omitted — internal/bootstrap use only); `updateTeam(organizationId, teamId, fields, actingUser)`, `reparentTeam`, `insertTeamBetween` gain a required `actingUser` parameter (admin-only); `updateUser`'s `fields.teamId` accepts `null` (unassign) in addition to a real team id (reassign, admin-only — already covered by its existing self-or-admin gate); `authenticateApiKey` gains one more null-result condition (owner is unassigned).

## Validation rules carried into the UI layer

- Team `name`: required, non-empty.
- Team `slug`: required, non-empty, unique within the organization — a collision surfaces `DuplicateTeamSlugError` (research.md §5) as a field-level form error, not a raw failure.
- Team `parentTeamId` (edit form): must resolve to a team in the same organization and must not introduce a cycle — both already enforced by `updateTeam`/`reparentTeam` (`CrossOrgReparentError`/cycle rejection); the UI surfaces whichever error comes back inline.
- Invitation `email` + `teamId`: rejects a second pending invitation to the same email for the same team (`DuplicateInvitationError`, already enforced by `inviteUser`).
- API key `scopes`: at least one required; non-admin callers are capped to `:read`-suffixed scopes (`isScopeAllowedForRole`, already enforced by `createApiKey`) — the issue-key form disables (not hides) any scope the caller isn't allowed to request.

## State transitions

### Team membership

```
(no user)
   │ createUser / invite→accept
   ▼
assigned to Team A ──remove (admin or Team A owner)──▶ unassigned (teamId = null)
   ▲                                                          │
   └──────────────── assign to Team B (admin) ────────────────┘
```

### API key (unchanged, included for completeness — authentication now also depends on owner state)

```
active ──revoke──▶ revoked (terminal)
active ──expiresAt passes──▶ effectively inactive for auth purposes (status still "active" until revoked, per existing behavior)
active, owner becomes unassigned ──▶ authentication fails (new: research.md §1) until owner is reassigned, at which point authentication resumes without any change to the key row itself
```
