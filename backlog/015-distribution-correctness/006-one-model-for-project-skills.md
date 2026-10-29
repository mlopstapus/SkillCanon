---
epic: 015-distribution-correctness
feature: 006-one-model-for-project-skills
status: open
dependencies: []
---

# One Model for Project Skills

There are two ways a skill gets "into" a project, and the UI shows only one.

- The skill's **Share → Projects → Grant** creates a project _subscription_. `GET /api/skills?projectId=` includes it, so the CLI syncs it.
- The project page lists only `project_skill_assignments` (required/optional), so it shows "Skills (0)" while the CLI syncs three.
- `POST /api/projects/{id}/skills` refuses a personally owned skill (`PERSONAL_SKILL_NOT_ASSIGNABLE`), yet the share drawer grants the same skill to the same project.

## Requirements

- [ ] Decide which model is canonical (PDR-016 says assignment from a participating team's catalog). Either the share drawer grants through it, or the project page shows subscriptions too.
- [ ] The project page has a way to add a skill. Today an admin who has just created a project and a skill has no control on the project page to connect them.
