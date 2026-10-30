# Feature Specification: Remove the Marketing Site

**Feature Branch**: `feat/remove-marketing-site`  **Source**: `backlog/018-internal-tribe-edition/001-remove-marketing-site.md` (Ben's spec, epic 018).

## User Scenarios
1. A signed-in visitor at `/` lands on `/dashboard`.
2. A signed-out visitor at `/` lands on first-run setup (`/register`) while no organization exists, otherwise on `/login`.
3. Crawlers are told to stay away (`robots.txt` disallows all; `robots` metadata noindex, nofollow).

## Requirements
- FR-001 `/` has no page; it redirects (no 200 marketing HTML). Reuses `resolveAuthPageAccess` for the session check.
- FR-002 `src/app/_components/marketing/` (and its tests), `opengraph-image.tsx`, Open Graph/Twitter metadata, and the marketing-only light-theme CSS block are deleted. Nothing in the app imported from the marketing folder, so no component moves.
- FR-003 `e2e/ui-walk.e2e.test.ts`: landing and theme-toggle tests become redirect and robots checks.

## Assumptions
- The theme toggle is dropped with the marketing page; 018/003 introduces its own dark/light handling.
- Coordinated with lane B (018/002): the setup check is `isInstanceSetUp(authDb)` from identity-access (their name); `/register` stays the setup entry.
