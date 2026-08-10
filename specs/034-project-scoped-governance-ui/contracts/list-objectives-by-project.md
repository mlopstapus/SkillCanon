# Contract: `listProjectObjectives` (existing, `@/bcs/governance`)

**Implementation-time correction (2026-08-09):** this function already existed before this feature started (CONTRACT.md already lists it, credited to an earlier feature, likely built for Distribution's REST layer per its own existing consumer note) — it is not new. This doc is kept as a record of the interface this feature relies on, not as a "new contract" announcement. No cross-BC-visible interface is actually added by this feature; the write path is entirely reused too.

## Signature

```ts
function listProjectObjectives(
  db: PostgresJsDatabase<Record<string, never>>,
  actor: { organizationId: string },
  projectId: string,
): Promise<ObjectiveRow[]>
```

`ObjectiveRow` is the existing row shape already returned by `listActiveByProject` (see data-model.md) — no new type is introduced.

## Preconditions

- Caller has already established tenant context via `withTenantContext` (this function does not call it itself — governance's own established convention, confirmed by grep: no `application/*` function in this codebase calls `withTenantContext` internally).
- `projectId` is assumed to belong to `actor.organizationId` — this function does **not** verify that itself (no throw on a cross-org `projectId`; it simply returns an empty array, since the underlying query filters by both `organization_id` and `project_id` and a mismatched pair matches nothing). Existence/ownership verification is the caller's responsibility for *write* operations (via `ObjectiveScopeVerifier.projectBelongsToOrganization`) — for this *read*, the project detail page's own routing already guarantees the viewer is looking at a real, org-scoped project before this function is ever called, so a defensive existence check here would be redundant.

## Postconditions

- Returns every `status = "active"` objective row with `project_id = projectId` and `organization_id = actor.organizationId`, ordered by `created_at` ascending (matches `listActiveByProject`'s existing order).
- Returns `[]` (not an error) when the project has no local objectives, or when `projectId`/`organizationId` don't match any rows.

## Consumers

- `src/app/(app)/projects/[id]/page.tsx` (this feature, only consumer as of this plan).
