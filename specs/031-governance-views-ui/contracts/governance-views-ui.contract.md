# Contract: Governance Views UI

## Routes

- `GET /teams/[teamId]/policies` — Policies tab for the given team scope, or for `?person=<userId>` if present (person must belong to `teamId`'s subtree — verified server-side, not just accepted from the query string).
- `GET /teams/[teamId]/objectives` — Objectives tab, same scope-resolution rules as above.

Both routes render the same `governance-view.tsx` component with a `tab` prop; switching tabs or scopes client-side updates the URL (`router.push`, no full navigation) rather than triggering a server round trip for every interaction.

## Scope Resolution

For team scope (`?person` absent): call `resolveEffectivePoliciesForTeam`/`resolveEffectiveObjectivesForTeam` with the route's `teamId`.

For person scope (`?person=<userId>` present): call `resolveEffectivePolicies`/`resolveEffectiveObjectives` with that `userId`. The UI must confirm the person is a real, org-scoped user (via the same authorization the app shell already establishes) before rendering — an invalid or cross-org `person` value must degrade to a "no longer available" state (spec Edge Cases), never a crash or an unscoped read.

## Server Actions (`actions.ts`)

| Action | Delegates to | Scope restriction |
|---|---|---|
| `createPolicyAction` | `createPolicy` | Team scope only — rejects if the current scope is a person (FR-005); server-side, not only UI-hidden |
| `updatePolicyAction` | `updatePolicy` | Same as create |
| `deletePolicyAction` | `deletePolicy` | Team scope only |
| `createObjectiveAction` | `createObjective` | Team or person scope |
| `updateObjectiveAction` | `updateObjective` | Team or person scope |
| `deleteObjectiveAction` | `deleteObjective` | Team or person scope |

Every action requires the authenticated session's authorization to already permit the write (reuses whatever `createPolicy`/`updatePolicy`/etc. already enforce — this feature does not add a new authorization model, per spec Assumptions). A `NOT_AUTHORIZED`-shaped rejection from the underlying function must surface as a clear UI error, not a generic failure.

## Enforcement Mode Options (Policy drawer)

Per Clarifications: `prepend`, `append`, `inject`, `validate` — all four real `enforcementType` values, not the mockup's three.
