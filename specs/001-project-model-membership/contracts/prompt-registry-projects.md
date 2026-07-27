# Contract: Prompt Registry Projects

This feature exposes TypeScript application/read-contract functions. It does not add REST routes, MCP tools, or UI surfaces.

## Types

```ts
interface ProjectActor {
  organizationId: string;
  userId: string;
}

interface ProjectIdentityVerifier {
  organizationExists(organizationId: string): Promise<boolean>;
  teamBelongsToOrganization(organizationId: string, teamId: string): Promise<boolean>;
  userBelongsToOrganization(organizationId: string, userId: string): Promise<boolean>;
}

interface CreateProjectParams {
  organizationId: string;
  teamId: string;
  leadUserId?: string | null;
  name: string;
  slug: string;
  description?: string | null;
}

interface UpdateProjectFields {
  name?: string;
  leadUserId?: string | null;
  description?: string | null;
}

interface AddProjectMemberParams {
  projectId: string;
  userId: string;
  role?: string;
}
```

## Application APIs

| Function | Behavior |
| --- | --- |
| `createProject(db, actor, params, identityVerifier, auditContext?)` | Validates organization/team/lead, inserts a project, records `project.created`, returns `ProjectSummary`. |
| `getProject(db, organizationId, projectId)` | Returns `ProjectSummary` or `null`; cross-organization ids return `null`. |
| `updateProject(db, actor, projectId, fields, identityVerifier, auditContext?)` | Updates editable fields only, validates lead when present, records `project.updated`, returns `ProjectSummary`; missing/cross-org project throws `ProjectNotFoundError`. |
| `deleteProject(db, actor, projectId, auditContext?)` | Deletes organization-scoped project, cascades memberships, records `project.deleted`; missing/cross-org project throws `ProjectNotFoundError`. |
| `listProjectsByOrganization(db, organizationId)` | Returns organization projects ordered by name. |
| `listProjectsByTeam(db, organizationId, teamId)` | Returns organization/team projects ordered by name. |
| `addProjectMember(db, actor, params, identityVerifier, auditContext?)` | Validates project and same-organization user, inserts membership, records `project_member.created`; duplicate membership throws `DuplicateProjectMemberError`. |
| `listProjectMembers(db, organizationId, projectId)` | Returns only the project's memberships ordered by `createdAt`; missing/cross-org project returns empty list. |
| `removeProjectMember(db, actor, projectId, userId, auditContext?)` | Deletes membership, records `project_member.deleted`; missing project/member throws a not-found domain error and writes no audit event. |

## Audit Actions

- `project.created`
- `project.updated`
- `project.deleted`
- `project_member.created`
- `project_member.deleted`

All audit events use the same transaction handle as the mutation and include `organizationId`, `actorUserId`, `resourceType`, `resourceId`, `before`, `after`, `transport`, and nullable `sourceIp`.
