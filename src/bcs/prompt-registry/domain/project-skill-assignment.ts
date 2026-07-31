/**
 * Domain types and errors for project skill assignment
 * (022-project-skill-assignment, PDR-016). A plain Prompt Registry catalog
 * fact — never a Governance policy, never resolved through any invoking
 * user's team-inheritance chain. `listRequiredSkillsForProject` is what
 * VCS Integration's PR check reads directly.
 */

export type ProjectSkillRequirement = "required" | "optional";

export interface ProjectSkillAssignment {
  id: string;
  organizationId: string;
  projectId: string;
  skillId: string;
  requirement: ProjectSkillRequirement;
  createdAt: Date;
}

export interface AssignSkillToProjectParams {
  requirement: ProjectSkillRequirement;
}

// ---------------------------------------------------------------------------
// Errors
//
// A nonexistent/cross-org project id reuses the existing `ProjectNotFoundError`
// (domain/project.ts); a nonexistent/cross-org skill id reuses the existing
// `SourceSkillNotFoundError` (domain/subscription.ts) — no new "not found"
// error classes are declared here for either (found during /speckit-analyze,
// findings U1/U2).
// ---------------------------------------------------------------------------

/** Thrown on a duplicate (project, skill) assignment pair (FR-002/SC-003). */
export class DuplicateProjectSkillAssignmentError extends Error {
  constructor() {
    super("This skill is already assigned to this project.");
    this.name = "DuplicateProjectSkillAssignmentError";
  }
}

/** Thrown when an unassign targets a (project, skill) pair with no existing assignment (FR-008). */
export class ProjectSkillAssignmentNotFoundError extends Error {
  constructor() {
    super("This skill is not assigned to this project.");
    this.name = "ProjectSkillAssignmentNotFoundError";
  }
}

/** Thrown when the skill's owner is neither the project's owner team nor one of its collaborator teams (FR-003). */
export class SkillNotEligibleForProjectError extends Error {
  constructor() {
    super(
      "This skill is not owned by the project's owner team or one of its collaborator teams.",
    );
    this.name = "SkillNotEligibleForProjectError";
  }
}

/** Thrown when assignment is attempted for a personally-owned (user-owned) skill, unconditionally (FR-004). */
export class PersonalSkillNotAssignableError extends Error {
  constructor() {
    super("A personally-owned skill cannot be assigned directly to a project.");
    this.name = "PersonalSkillNotAssignableError";
  }
}
