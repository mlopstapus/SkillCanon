# Feature Specification: Roster Import

**Feature**: `054-roster-import` · **Backlog**: `backlog/019-org-structure/001-roster-import.md` · REST only, no database access, no migration.

Defaults used (Ben to confirm, all in the feature file's questions): username = email local part (numbered on collision); team slug `org-<slug of name>`; the top-level teams hang under the instance's single root team (or `--root-team`); a manager who is mapped to a name shared with another manager owns that team first-come; a manager who has no manager of their own is a member of the team they own (Executive when mapped to it).

## User Scenarios
- **US1** An admin runs `pnpm import:org --roster r.csv --teams t.json` against an instance and gets the team tree, owners, members and a report.
- **US2** A second run with unchanged files writes nothing; a moved person is moved and only them.
- **US3** A manager missing from the mapping gets `Squad: <name>`, listed in the report; the run still succeeds.

## Requirements
- **FR-001** CSV columns `name, email, title, department, manager_email`; mapping `manager_email → team name`. Paths inside the repo are refused.
- **FR-002** One team per manager with reports; parent = the manager's manager's team; people with no manager → `Executive`.
- **FR-003** A manager owns and belongs to their team; others join their manager's team.
- **FR-004** Idempotent by email and slug; removed people are reported, not deleted.
- **FR-005** Report: counts, squads to name, invalid rows, warnings; exit 0 on success, 1 on any REST error.
- **FR-006** Nothing invented; new people get a random password and `member`. `--dry-run` writes nothing.
- **FR-007** `managerId` is skipped until 019/002 ships.
