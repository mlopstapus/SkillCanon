---
epic: 011-vcs-integration
feature: 002-repo-project-linking
status: open
dependencies: ["001-github-app-registration-and-installation"]
---

# Repo↔Project Linking

Build the `RepoLink` aggregate — the many-to-many join between a GitHub repo (within an installation) and a SkillCanon project, decided during architecture as needing to support both a repo linked to multiple projects (monorepo) and a project spanning multiple repos.

## Requirements

- [ ] `linkRepo(orgId, projectId, installationId, githubRepoId, actingUserId)` creates a `RepoLink` row; enforces uniqueness on `(installationId, githubRepoId, projectId)` — the same repo can link to a different project again, but not the same project twice.
- [ ] `unlinkRepo(orgId, repoLinkId, actingUserId)` removes a link. Does not delete any `PrCheck` history for that link (per `OWNERSHIP.md`'s append-only stance on `pr_checks`).
- [ ] `listRepoLinks(orgId, projectId?)` returns links, optionally filtered to one project, including enough repo metadata (full name, installation account) to render a management UI.
- [ ] Linking a repo validates the repo is actually accessible through the given `installationId` (call GitHub's list-repos-for-installation API, don't just trust the client-submitted `githubRepoId`).
- [ ] `RepoLinked`/`RepoUnlinked` audit events fire on link/unlink.
- [ ] A minimal linking UI exists under `src/app/(app)/settings/integrations/github/` — pick an installation, pick a repo from that installation's accessible repos, pick a project, confirm.

## Acceptance Criteria

- [ ] Linking the same repo to two different projects succeeds and produces two distinct `RepoLink` rows.
- [ ] Linking the same repo to the same project twice is rejected with a clear error, not a duplicate row.
- [ ] Attempting to link a repo the installation doesn't actually have access to (spoofed `githubRepoId`) is rejected.
- [ ] Unlinking a repo leaves prior `PrCheck` rows for it queryable (verify via `getPrCheck`), just with no new evaluations firing afterward.

## Open Questions

None — many-to-many was already settled during architecture discovery.

## Dependencies

- `backlog/011-vcs-integration/001-github-app-registration-and-installation.md` (needs a real `Installation` to link against)
- Prompt Registry's `Project` model (`backlog/006-prompt-registry/001-project-model-and-membership.md`) must exist

## Technical Notes

- See `src/bcs/vcs-integration/CONTRACT.md`'s `RepoLink` data contract for the exact shape.
- Repo-accessibility validation is the anti-corruption-layer boundary doing real work here — don't skip it as a "trust the client" shortcut, since a malicious/buggy client could otherwise link an org's SkillCanon project to a repo it has no actual GitHub access to.
