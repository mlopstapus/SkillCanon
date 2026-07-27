export interface ProjectActor {
  organizationId: string;
  userId: string;
}

export interface ProjectIdentityVerifier {
  organizationExists: (organizationId: string) => Promise<boolean>;
  teamBelongsToOrganization: (organizationId: string, teamId: string) => Promise<boolean>;
  userBelongsToOrganization: (organizationId: string, userId: string) => Promise<boolean>;
}

export interface ProjectSummary {
  id: string;
  organizationId: string;
  teamId: string;
  leadUserId: string | null;
  name: string;
  slug: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectMemberSummary {
  id: string;
  projectId: string;
  userId: string;
  role: string;
  createdAt: Date;
}

export interface CreateProjectParams {
  organizationId: string;
  teamId: string;
  leadUserId?: string | null;
  name: string;
  slug: string;
  description?: string | null;
}

export interface UpdateProjectFields {
  name?: string;
  leadUserId?: string | null;
  description?: string | null;
}

export interface AddProjectMemberParams {
  projectId: string;
  userId: string;
  role?: string;
}

export class ProjectOrganizationNotFoundError extends Error {
  constructor(organizationId: string) {
    super(`No organization found with id "${organizationId}".`);
    this.name = "ProjectOrganizationNotFoundError";
  }
}

export class ProjectTeamNotFoundError extends Error {
  constructor(teamId: string) {
    super(`No team found with id "${teamId}" in the project organization.`);
    this.name = "ProjectTeamNotFoundError";
  }
}

export class ProjectUserNotFoundError extends Error {
  constructor(userId: string) {
    super(`No user found with id "${userId}" in the project organization.`);
    this.name = "ProjectUserNotFoundError";
  }
}

export class ProjectNotFoundError extends Error {
  constructor(projectId: string) {
    super(`No project found with id "${projectId}" in the caller's organization.`);
    this.name = "ProjectNotFoundError";
  }
}

export class DuplicateProjectNameError extends Error {
  constructor(name: string) {
    super(`A project named "${name}" already exists in this organization.`);
    this.name = "DuplicateProjectNameError";
  }
}

export class DuplicateProjectSlugError extends Error {
  constructor(slug: string) {
    super(`A project with slug "${slug}" already exists in this organization.`);
    this.name = "DuplicateProjectSlugError";
  }
}

export class DuplicateProjectMemberError extends Error {
  constructor(projectId: string, userId: string) {
    super(`User "${userId}" is already a member of project "${projectId}".`);
    this.name = "DuplicateProjectMemberError";
  }
}

export class ProjectMemberNotFoundError extends Error {
  constructor(projectId: string, userId: string) {
    super(`No membership found for user "${userId}" on project "${projectId}".`);
    this.name = "ProjectMemberNotFoundError";
  }
}
