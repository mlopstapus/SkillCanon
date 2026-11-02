---
epic: 019-org-structure
feature: 001-roster-import
status: open
dependencies: []
---

# Roster Import

One script that turns an HR roster into SkillCanon teams and people, re-runnable without side effects. Replaces the throwaway `seed-rippling.mjs` Ben used on 2026-11-02.

## Requirements

- [x] `pnpm import:org --roster <csv> --teams <json> [--server <url>] [--api-key-file <path>]` reads a CSV with columns `name, email, title, department, manager_email` and a JSON mapping of `manager_email → team name`. Files live outside the repo; the script refuses a path inside the tree.
- [x] **Teams.** One team per manager who has reports, named from the mapping. Parent = the manager's own manager's team. People with no manager go in a top-level team named `Executive`. A manager missing from the mapping gets a team named `Squad: <name>` and is listed in the run report as needing a name; the run still succeeds.
- [x] **Members and owners.** Each person joins the team of their manager. A manager **is a member of the team they own** and is set as its `ownerId`. Someone whose manager has no team (a manager of one who isn't in the mapping either) still gets a `Squad:` team, so no reporting line is dropped.
- [x] **Idempotent.** Matches people by email and teams by slug. A second run with the same files changes nothing; a run with a moved person moves them (and only them). Removed people are reported, not deleted.
- [x] **Report.** Prints counts (teams created/updated, people created/moved/unchanged), the `Squad:` teams awaiting a name, and roster emails that failed validation. Exit code 0 on success even with squads to name; 1 on any REST error.
- [x] **No invented data.** Nothing is created that the roster doesn't state. No placeholder passwords in the output; created people get a random password and `role: member`, and the report says they need a reset.
- [x] Sets `managerId` on each person once 002 ships; until then it is skipped, not faked.

## Acceptance Criteria

- [x] A fictional fixture roster (`e2e/fixtures/org/roster.csv`, ~25 people, 5 managers, one manager absent from the mapping, one person with no manager) imports onto a fresh instance and `e2e/ui-walk.e2e.test.ts` (or a new `e2e/org.e2e.test.ts`) asserts the tree, owners, the `Executive` team and one `Squad:` team.
- [x] Running the import twice produces the same counts and no audit events on the second run beyond reads.
- [x] The README's admin section documents the two files and the convention "manager owns and belongs to the team".

## Technical Notes

- Use the REST API (`/api/teams`, `/api/users`, `/api/teams/[id]/reparent`, `PUT /api/users/[id]`), not the database, so RLS and audit stay in the loop. Page size is capped at 100.
- Ben's working version is in his scratchpad (`seed-rippling.mjs`); its parse/match logic is throwaway, but the ensure-team / ensure-user / walk shape is right.
- The real Tribe roster stays in `.local/` on Ben's machine. Do not commit it, do not use real names in fixtures.

## Questions for Ben (built to these defaults)

1. Username for a new person: the email's local part, numbered if taken.
2. Team slug: `org-<slug of the team name>`; top-level teams sit under the instance's single root team (`--root-team <slug>` if there are several).
3. A manager with no manager of their own: member of the team they own (so map the CEO to `Executive`); people with no manager who own nothing sit in `Executive`.
4. Two managers mapped to the same team name: the first owns it, a warning is printed.
5. A manager email that is not in the roster: that person is treated as having no manager, with a warning.
