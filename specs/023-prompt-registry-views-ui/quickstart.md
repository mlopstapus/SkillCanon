# Quickstart: Prompt Registry Views UI

Validates the feature end-to-end against a real dev database.

## Prerequisites

- `pnpm install` (once)
- Postgres reachable per `docker-compose.yaml` defaults (or a remapped port per `CLAUDE.md` if another project already occupies 5432/3000 locally)
- `pnpm db:migrate` applied (includes this feature's new `project_repos` migration)

## Setup

```bash
pnpm exec next dev -p 3001   # or `pnpm dev`; see CLAUDE.md for the -p flag gotcha
```

1. Register the first-run admin at `/register` — this org admin can reach every page below.
2. From a second browser/incognito session, register a second user in the same org (or invite via `/teams`) to exercise sharing/membership scenarios.

## Validate: browse, search, view a prompt (User Story 1)

1. Open **Prompts** from the sidebar (`/prompts`) — confirm the empty state ("no prompts yet") renders before anything exists.
2. Create a prompt (name, description, system template, user template, tags) — confirm it appears in the list.
3. Search by a substring of its name/description — confirm the list narrows; clear the search — confirm it returns.
4. Filter by ownership (Mine / Shared with team) and by project — confirm both narrow independently, and "Clear filters" resets both plus search in one action.
5. Open the prompt's detail view — confirm Template (system/user templates + input schema), Preview (rendered system/user message via `expand()`), and Applied policies tabs all render.
6. Deprecate the prompt from its detail view — confirm the deprecated badge appears in both list and detail. Reactivate it — confirm the badge clears everywhere.

## Validate: versioning (User Story 2)

1. Publish a new version with edited templates and tags, leaving "set active immediately" checked — confirm the detail view now shows the new version as active and the old one preserved in history.
2. Publish a third version with "set active immediately" unchecked — confirm the previously-active version stays active.
3. Open version history — confirm every version lists its date/tags/active-status; use "Set active" on an older version — confirm it becomes active without altering its own content.

## Validate: sharing (User Story 3)

1. From the prompt detail's Share drawer, grant an individual user access — confirm they can subscribe to the prompt and it appears in their own `/prompts` accessible list.
2. Grant a team access — confirm every member of that team also sees the prompt in their accessible list.
3. Grant a project access — confirm every member of that project sees the prompt in their accessible list too, even a member who belongs to none of the prompt's owning/subscribed teams directly.
4. Revoke one of the three grants — confirm only that grant's recipients lose access; the other two remain unaffected.
5. Confirm the detail page's shared-team/subscriber/copy counts update after each grant/revoke.

## Validate: project setup and curation (User Story 4)

1. Open **Projects** (`/projects`), create a new project (name, owning team, lead, description) — confirm it appears in the list with a 0 member/prompt count as appropriate.
2. Open its detail view — confirm Members, Prompts, Repositories, Teams tabs all render (no Metrics tab — intentionally out of scope, see spec.md Assumptions).
3. Add a collaborator team — confirm it appears under Teams; remove it — confirm the count updates.
4. Add an individual member (not via any team) — confirm they appear under Members; remove them.
5. Link a repository (name, URL, branch) — confirm it appears under Repositories; remove it.
6. In Prompts, confirm only prompts owned by (or subscribed/forked into) one of the project's participating teams appear as curatable — mark one required, then optional, then remove it — confirm it moves between the Required/Optional/Available groups and the project's prompt count updates each time.

## Validate: authorization boundaries (cross-cutting)

1. As a non-admin, non-owner-team member, attempt to share a prompt with a team, add a collaborator team, or link a repository directly via the server action (not just hiding the UI control) — confirm each is rejected server-side.
2. As a user outside the organization (a second org's admin), attempt to view or act on the first org's prompt/project ids directly — confirm cross-org access is denied the same way a nonexistent id would be (per this codebase's established cross-org-denial-equals-not-found convention).

## Verify the audit fix

1. Deprecate/reactivate a prompt and set an older version active — then check `/settings/audit-log` — confirm `prompt.deprecated`, `prompt.reactivated`, and `prompt.version_activated` events now appear (this feature's fix; previously these two mutations produced no audit trail at all).
