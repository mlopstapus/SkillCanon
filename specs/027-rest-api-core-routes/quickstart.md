# Quickstart: REST API Core Routes

## Prerequisites

- `pnpm install`, a running Postgres (`docker compose up -d database`, or Testcontainers for tests — no manual setup needed for `pnpm test`).
- An existing organization/admin user (via first-run bootstrap — see `README.md` Quickstart — or a Testcontainers-seeded fixture in tests).

## Calling the API with a session cookie (same as the bundled web UI)

```bash
# Log in via the existing auth route/server action to get a session cookie, then:
curl -s http://localhost:3000/api/skills \
  -H "Cookie: skillcanon_session=<token>"
```

## Calling the API with an API key (the Skill Sync CLI's path)

```bash
curl -s http://localhost:3000/api/skills/my-skill/expand \
  -H "Authorization: Bearer <raw-api-key>" \
  -H "Content-Type: application/json" \
  -d '{"input": {"topic": "onboarding"}}'
```

Both forms hit the same route handler — `resolveCaller` (`src/shared/api/auth.ts`) resolves whichever credential is present, uniformly, on every route (FR-010).

## Example: full create-read-update-delete lifecycle for a team

```bash
# Create (admin session/key required)
curl -s -X POST http://localhost:3000/api/teams \
  -H "Authorization: Bearer <admin-key>" -H "Content-Type: application/json" \
  -d '{"name": "Platform", "slug": "platform"}'
# → 201 { "id": "...", "name": "Platform", "slug": "platform", ... }

# Read
curl -s http://localhost:3000/api/teams/<id> -H "Authorization: Bearer <admin-key>"

# Update
curl -s -X PUT http://localhost:3000/api/teams/<id> \
  -H "Authorization: Bearer <admin-key>" -H "Content-Type: application/json" \
  -d '{"name": "Platform Engineering"}'

# List
curl -s http://localhost:3000/api/teams -H "Authorization: Bearer <admin-key>"
```

(No `DELETE /api/teams/{id}` — see `contracts/teams-users-apikeys.contract.md`: no underlying `identity-access` delete function exists yet.)

## Example: error shape is identical across resources

```bash
curl -s http://localhost:3000/api/teams/00000000-0000-0000-0000-000000000000 -H "Authorization: Bearer <key>"
# → 404 { "error": { "code": "TEAM_NOT_FOUND"-equivalent-per-registry, "message": "..." } }

curl -s http://localhost:3000/api/policies/00000000-0000-0000-0000-000000000000 -H "Authorization: Bearer <key>"
# → 404 { "error": { "code": "POLICY_NOT_FOUND", "message": "..." } }
```

Same envelope shape, same status code convention, regardless of resource (SC-002).

## Running the tests

```bash
pnpm vitest run src/shared/api        # error mapper unit tests, no DB
pnpm test                              # full suite, incl. every route's Testcontainers integration test
```
