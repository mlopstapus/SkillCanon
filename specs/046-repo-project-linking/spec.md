# Feature Specification: Repo-Project Linking

**Feature Branch**: `feat/011-002-repo-linking` | **Created**: 2026-10-30 | **Status**: Draft | **Depends on**: 045-github-app-installation

**Input**: backlog/011-vcs-integration/002-repo-project-linking.md

## User Scenarios & Testing

### User Story 1 - Admin links a GitHub repo to a project (P1)
An org admin picks an installation, a repository that installation can see, and a project, and confirms. The link appears in the list.
**Acceptance**: 1. Linking the same repo to two projects creates two links. 2. Linking the same repo to the same project twice is rejected with a clear message. 3. A repo the installation cannot see (even with a guessed id) is rejected. 4. An unknown project, or a non-admin, is rejected.

### User Story 2 - Admin unlinks (P2)
Unlinking removes the link from the list and stops new evaluations; any PR check history for it remains readable. The project can be relinked later.

### User Story 3 - Admin sees links (P2)
Links can be listed for the org or one project, showing repo name, installation account and project.

### Edge cases
Other organizations' links and installations are never visible or touchable. GitHub unreachable while listing repos shows a retry message, not a broken page.

## Requirements
- **FR-001** Linking requires an org admin, an active installation of the same org, a repo GitHub confirms the installation can access, and a project of the same org.
- **FR-002** A live (project, repo, installation) combination is unique; unlinked ones do not block relinking.
- **FR-003** Unlink is a soft delete; history stays queryable.
- **FR-004** Link and unlink each write an audit event.
- **FR-005** List links by org or project with installation account for display.
- **FR-006** The GitHub settings page offers the picker, link list and unlink, with empty states for no installation, no links, no repos, no projects.
- **FR-007** All rows are organization-scoped with row-level security; the webhook role can read links to resolve the owning organization.

## Success Criteria
- **SC-001** An admin links a repo in under a minute from the settings page.
- **SC-002** 100% of spoofed repo ids and cross-organization attempts are rejected in tests.

## Assumptions
Admin-only management (default; project-owner delegation can follow). Per-repo, not per-subdirectory, matching the epic's monorepo simplification. Needs Ben's live App to exercise against real GitHub.
