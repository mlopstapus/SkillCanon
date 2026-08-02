# Contract: Projects (prompt-registry)

All endpoints require auth per `error-shape.contract.md`.

| Method | Path | BC call |
|---|---|---|
| POST | `/api/projects` | `createProject(tx, params)` |
| GET | `/api/projects` | `listProjectsByOrganization(tx, orgId)` or `listProjectsByTeam(tx, orgId, teamId)` if `?teamId=` given |
| GET | `/api/projects/{projectId}` | `getProject(tx, orgId, projectId)` |
| PUT | `/api/projects/{projectId}` | `updateProject(orgId, projectId, fields)` — owner-team-admin-only |
| DELETE | `/api/projects/{projectId}` | `deleteProject(orgId, projectId)` — owner-team-admin-only |
| POST | `/api/projects/{projectId}/members` | `addProjectMember(tx, orgId, projectId, userId)` |
| GET | `/api/projects/{projectId}/members` | `listProjectMembers(tx, orgId, projectId)` |
| DELETE | `/api/projects/{projectId}/members/{userId}` | `removeProjectMember(orgId, projectId, userId)` |
| POST | `/api/projects/{projectId}/teams` | `addCollaboratorTeam(tx, actingUser, projectId, { teamId }, auditContext)` — owner-team-admin |
| GET | `/api/projects/{projectId}/teams` | `listProjectTeams(tx, orgId, projectId)` |
| DELETE | `/api/projects/{projectId}/teams/{teamId}` | `removeCollaboratorTeam(tx, actingUser, projectId, { teamId }, auditContext)` |
| POST | `/api/projects/{projectId}/repos` | `addProjectRepo(tx, actingUser, projectId, { name, url, branch? }, auditContext)` |
| GET | `/api/projects/{projectId}/repos` | `listProjectRepos(tx, orgId, projectId)` |
| DELETE | `/api/projects/{projectId}/repos/{repoId}` | `removeProjectRepo(tx, actingUser, projectId, repoId, auditContext)` |
| POST | `/api/projects/{projectId}/skills` | `assignSkillToProject(tx, actingUser, projectId, skillId, { requirement }, auditContext)` — body `{ skillId, requirement }` |
| GET | `/api/projects/{projectId}/skills` | `listProjectSkillAssignmentsForOrganization(tx, orgId)`, filtered to `projectId` |
| DELETE | `/api/projects/{projectId}/skills/{skillId}` | `unassignSkillFromProject(tx, actingUser, projectId, skillId, auditContext)` |
| POST | `/api/projects/{projectId}/objectives` | `createObjective(tx, { organizationId, projectId, ... })` (governance BC call, routed here since the legacy resource nests objectives under a project) |
| GET | `/api/projects/{projectId}/objectives` | `listProjectObjectives(tx, orgId, projectId)` (governance) |
| GET | `/api/projects/{projectId}/metrics` | `getProjectMetrics(tx, orgId, projectId)` |

Note: the two `/objectives` sub-routes call `governance`'s barrel, not `prompt-registry`'s — the route file itself still lives under `projects/{projectId}/objectives/` for URL-shape parity with the legacy nested resource, but its only cross-BC-looking behavior is calling the correct BC per function ownership (constitution D1: each call still goes through that BC's own exposed contract function, nothing reaches into governance's internals).
