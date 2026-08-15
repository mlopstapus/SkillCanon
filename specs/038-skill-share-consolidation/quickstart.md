# Quickstart: Validating skill share/project-drawer consolidation

## Prerequisites

- Local dev stack running (`pnpm dev`, or the Docker Compose stack per
  `CLAUDE.md`'s "Rebuild (self-hosted stack)" row), migrated
  (`pnpm db:migrate` — no new migration for this feature, but the stack
  must already be up to date).
- Logged in as a user with at least one skill that has: a team grant, a
  project grant, and (for the copy-count check) at least one forked-from
  relationship. The seeded dev account (`alice@example.com`) and its
  existing skills/forks are sufficient if present; otherwise create one
  skill, fork it once (`Make a copy`), and grant it to a team from the
  Share drawer.

## Automated verification

```bash
pnpm typecheck
pnpm lint
pnpm exec vitest run --fileParallelism=false --testTimeout=30000 src/app/\(app\)/prompts src/bcs/prompt-registry
```

Expect: zero type errors, zero lint errors, all tests passing — including
the new `count-forks-of-skill.test.ts` and the updated
`share-drawer.test.tsx` / `prompt-detail-view.test.tsx`. Confirm
`assign-projects-drawer.test.tsx` no longer exists (deleted, not just
skipped).

## Manual validation (User Story 1 — one sharing control)

1. Open any skill's detail page (`/prompts/<name>`).
2. Confirm the toolbar shows exactly one sharing-related button: **Share**.
   There is no **Projects** button.
3. Click **Share**. Confirm the drawer shows People / Teams / Projects
   sections, each with **Grant**/**Revoke** buttons (not "Share"/"Revoke"
   for Teams) — and no required/optional/enforcement control anywhere in
   the drawer.
4. Confirm the banner copy reads: *"Members of a shared team can subscribe
   to get live updates as new versions publish, or make a copy they own
   and edit independently. Only you can edit the original."*

## Manual validation (User Story 2 — enforcement stays on the project page)

1. Open a project's detail page (`/projects/<id>`) and its **Skills** tab.
2. Mark an available skill **Required**, then **Optional**, then remove it
   (back to Available). Confirm this still works exactly as before —
   unaffected by this feature.
3. Return to that skill's own detail page. Confirm its project-label badge
   (next to the skill name) still shows the project it's required/optional
   for, read-only — with no way to edit that from this page.

## Manual validation (User Story 3 — share summary)

1. Open a skill with at least one team grant, at least one other
   subscription (person or project), and at least one fork elsewhere in
   the org.
2. Confirm the summary pill (below the description, and reachable by
   reopening Share) reads `"<N> teams · <M> subscribers · <K> copies"`
   with real counts matching what you set up.
3. Open a skill with zero grants of any kind. Confirm no summary pill is
   shown at all (same visibility rule as today — team-or-project grant
   required to show anything).

## Expected outcome

All three user stories pass manually, the automated suite is green, and
`git diff --stat` shows: `assign-projects-drawer.tsx` +
`assign-projects-drawer.test.tsx` deleted; `prompts-repo.ts`,
`count-forks-of-skill.ts` (+ test), `CONTRACT.md`, `index.ts` (barrel),
`page.tsx`, `prompt-detail.tsx`, `prompt-detail-view.tsx`,
`share-drawer.tsx` (+ test) modified. No migration files. No changes under
`src/app/(app)/projects/`.
