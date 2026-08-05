# Quickstart: Governance Views UI

## Prerequisites

- Node.js >=24
- Docker available for Testcontainers PostgreSQL
- Dependencies installed with `pnpm install`

## Validate

1. Run the focused governance application-layer tests (the two new resolution functions):

   ```sh
   pnpm test src/bcs/governance/application/resolve-effective-policies-for-team.test.ts src/bcs/governance/application/resolve-effective-objectives-for-team.test.ts
   ```

2. Run the rest of the governance bounded context's existing tests, to confirm no regression:

   ```sh
   pnpm test src/bcs/governance
   ```

3. Run the new page/component tests:

   ```sh
   pnpm test src/app/\(app\)/teams
   ```

4. Manual smoke test (in a real browser, `pnpm dev` or `docker compose up -d`):
   - Navigate to a team's Governance page (`/teams/{teamId}/policies`).
   - Confirm inherited policies from ancestor teams appear, each attributed to its source team.
   - Create a new local policy at that team (name, enforcement mode, priority, content) — confirm it appears in Local immediately.
   - Select a descendant team or a person under this team from the scope tree — confirm the policy just created now appears in their Inherited section.
   - Select a person (not a team) as scope — confirm the "New policy" action is unavailable or clearly disabled.
   - Switch to the Objectives tab — confirm objective creation works at both a team and a person scope.
   - Edit and then delete the policy created above — confirm both operations reflect immediately, including in descendant views.
   - Filter the scope tree by a search term — confirm only matching teams/people remain.

5. Run the full finish pipeline:

   ```sh
   pnpm lint
   pnpm typecheck
   pnpm test
   pnpm build
   ```

## Expected Result

- Every team and person scope shows the correct inherited (from ancestor teams) plus local (defined at that exact scope) policies and objectives.
- A new local policy/objective is visible immediately at its own scope and at every descendant scope, without a page reload.
- Policy creation/editing is impossible at a person scope, both in what the UI offers and in what the underlying action accepts.
- Scope and tab switching never triggers a full page navigation.
