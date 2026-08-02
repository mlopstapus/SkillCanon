# Contract: Error Shape & Auth (cross-cutting, applies to every endpoint below)

## Authentication

Every endpoint requires **either**:
- A valid session cookie (`authenticateSession`), **or**
- `Authorization: Bearer <api-key>` (`authenticateApiKey`)

No endpoint is session-only or key-only (2026-08-02 clarification, FR-010). Missing/invalid/expired credential of either kind →

```
401 { "error": { "code": "UNAUTHENTICATED", "message": "..." } }
```

## Cross-tenant access

A path/body id belonging to another organization always behaves identically to a nonexistent id — the underlying BC's own `*NotFoundError` (never a distinguishing "forbidden, exists elsewhere" response). See data-model.md's registry for the exact `*_NOT_FOUND`-family codes.

## Error envelope (every non-2xx response)

```json
{ "error": { "code": "SCREAMING_SNAKE_CASE", "message": "human-readable", "details": {} } }
```

`details` is present only for `VALIDATION_FAILED` (Zod `.flatten()` field errors) or a registry error class that itself carries structured detail; omitted otherwise. Full class→code→status table: `data-model.md`.

## Pagination (skills, teams, projects, users only — FR-015)

Query params `page` (default 1), `pageSize` (default 20, max 100). Response: `{ items: [...], page, pageSize, total }`. Invalid values → `422 VALIDATION_FAILED`.
