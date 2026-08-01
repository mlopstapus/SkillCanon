/**
 * Domain types and errors for linking git repositories to a project
 * (023-prompt-registry-views-ui, new capability — no prior feature modeled
 * this).
 */

export interface ProjectRepo {
  id: string;
  projectId: string;
  name: string;
  url: string;
  branch: string;
  createdAt: Date;
}

export interface AddProjectRepoParams {
  name: string;
  url: string;
  branch?: string;
}

export class ProjectRepoNotFoundError extends Error {
  constructor(projectId: string, repoId: string) {
    super(`No repository found with id "${repoId}" on project "${projectId}".`);
    this.name = "ProjectRepoNotFoundError";
  }
}

export class DuplicateProjectRepoError extends Error {
  constructor(url: string) {
    super(`Repository "${url}" is already linked to this project.`);
    this.name = "DuplicateProjectRepoError";
  }
}
