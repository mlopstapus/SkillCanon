# Data Model: Project Model & Membership

## Project

A team-owned Prompt Registry workspace scoped to exactly one organization.

### Fields

- `id`: UUID primary key
- `organizationId`: UUID, required, organization scope owned by Identity & Access
- `teamId`: UUID, required, owning team id validated through Identity & Access
- `leadUserId`: UUID nullable, validated through Identity & Access when present
- `name`: non-empty text, unique within organization
- `slug`: non-empty text, unique within organization, immutable in this feature
- `description`: nullable text
- `createdAt`: timestamptz, default now
- `updatedAt`: timestamptz, default now and changed on update

### Relationships

- Has many `ProjectMember` rows.
- References Identity & Access organization/team/user IDs as external IDs only.
- Referenced by Governance and future Prompt Registry resources through Prompt Registry's public read contract.

### Validation Rules

- `organizationId` must exist according to Identity & Access.
- `teamId` must belong to `organizationId`.
- `leadUserId`, when present, must belong to `organizationId`.
- `name` and `slug` are unique per organization.
- Update may change only `name`, `description`, and `leadUserId`; it cannot change organization, owning team, or slug.
- Reads, updates, and deletes require organization scope and treat cross-organization IDs the same as nonexistent IDs.

### State Transitions

- Created via `createProject` with optional lead.
- Updated via `updateProject` for editable metadata.
- Deleted via `deleteProject`; hard delete removes the project from reads/lists and cascades project memberships.

## Project Member

A membership grant for one user on one project.

### Fields

- `id`: UUID primary key
- `projectId`: UUID, required, references `Project.id` with cascade delete
- `userId`: UUID, required, user id validated through Identity & Access
- `role`: non-empty text role label, default `member`
- `createdAt`: timestamptz, default now

### Relationships

- Belongs to exactly one `Project`.
- References one Identity & Access user as an external ID.

### Validation Rules

- The owning project must exist in the caller's organization.
- `userId` must belong to the same organization as the owning project; the user may belong to any team in that organization.
- `(projectId, userId)` is unique at the database layer.
- Member list results are scoped by project and ordered by `createdAt`.
- Removing a nonexistent membership returns a clear not-found result and writes no audit event.

### State Transitions

- Created via `addProjectMember`.
- Deleted via `removeProjectMember` or project cascade delete.

## Public Contract Shapes

```ts
interface ProjectSummary {
  id: string;
  orgId: string;
  teamId: string;
  leadUserId: string | null;
  name: string;
  slug: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ProjectMemberSummary {
  id: string;
  projectId: string;
  userId: string;
  role: string;
  createdAt: Date;
}
```
