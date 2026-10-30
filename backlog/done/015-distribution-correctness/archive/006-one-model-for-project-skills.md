---
epic: 015-distribution-correctness
feature: 006-one-model-for-project-skills
status: done
dependencies: []
---

# One Model for Project Skills

There are two ways a skill gets "into" a project, and the UI shows only one.

- The skill's **Share → Projects → Grant** creates a project _subscription_. `GET /api/skills?projectId=` includes it, so the CLI syncs it.
- The project page lists only `project_skill_assignments` (required/optional), so it shows "Skills (0)" while the CLI syncs three.
- `POST /api/projects/{id}/skills` refuses a personally owned skill (`PERSONAL_SKILL_NOT_ASSIGNABLE`), yet the share drawer grants the same skill to the same project.

## Requirements

- [x] Decide which model (D2: project assignment is canonical; a Share → Project grant also creates an optional assignment, and revoking/unassigning keeps the two in sync; the project page lists every assigned skill) is canonical (PDR-016 says assignment from a participating team's catalog). Either the share drawer grants through it, or the project page shows subscriptions too.
- [x] The project page has a way to add a skill. Today an admin who has just created a project and a skill has no control on the project page to connect them.

Personal skills stay non-assignable through `POST /api/projects/{id}/skills` (PDR-016); they reach a project only via the Share/"Add skill" grant path. Grants made before this change have no assignment row and are not back-filled.
