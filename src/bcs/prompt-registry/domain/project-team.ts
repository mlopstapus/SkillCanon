/**
 * Domain types and errors for project collaborator teams
 * (022-project-skill-assignment, pulled forward from
 * `backlog/006-prompt-registry/001-project-model-and-membership.md` per
 * PDR-016). A project's *owner* team is `projects.team_id`, never a row
 * here — this type only ever describes an additional, collaborator team.
 */

export interface ProjectTeam {
  id: string;
  projectId: string;
  teamId: string;
  createdAt: Date;
}

export interface AddCollaboratorTeamParams {
  teamId: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Thrown on a duplicate (project, team) collaborator pair (FR-019/SC-008). */
export class DuplicateCollaboratorTeamError extends Error {
  constructor() {
    super("This team is already a collaborator on this project.");
    this.name = "DuplicateCollaboratorTeamError";
  }
}

/** Thrown when removal targets a team that is not currently a collaborator on the given project (FR-023). */
export class CollaboratorTeamNotFoundError extends Error {
  constructor() {
    super("This team is not a collaborator on this project.");
    this.name = "CollaboratorTeamNotFoundError";
  }
}

/** Thrown when a project's own owner team is named as a collaborator-team target (FR-020). */
export class OwnerTeamCannotBeCollaboratorError extends Error {
  constructor() {
    super("A project's owner team cannot also be added as its own collaborator.");
    this.name = "OwnerTeamCannotBeCollaboratorError";
  }
}

/** Thrown when the named team does not belong to the project's organization (FR-021). */
export class ProjectTeamOrgMismatchError extends Error {
  constructor() {
    super("The team must belong to the same organization as the project.");
    this.name = "ProjectTeamOrgMismatchError";
  }
}
