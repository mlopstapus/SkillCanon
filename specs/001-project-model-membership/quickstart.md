# Quickstart: Project Model & Membership

## Prerequisites

- Node.js >=24
- pnpm 10.26.0
- Docker available for Testcontainers-backed database tests

## Validation Commands

```sh
pnpm install
pnpm test -- src/bcs/prompt-registry
pnpm lint
pnpm typecheck
pnpm build
```

## Smoke Scenario

1. Create an organization/team/user fixture through Identity & Access helpers.
2. Call `createProject` with that organization, team, and optional lead user.
3. Assert `getProject`, `listProjectsByOrganization`, and `listProjectsByTeam` return the project in organization/name order.
4. Add two users from different teams in the same organization with `addProjectMember`.
5. Assert `listProjectMembers` returns those memberships in creation order.
6. Remove one member and assert the membership disappears and one `project_member.deleted` audit event exists.
7. Attempt to add a user from another organization and assert no membership or audit event is created.
8. Delete the project and assert the project and memberships are no longer returned and one `project.deleted` audit event exists.
