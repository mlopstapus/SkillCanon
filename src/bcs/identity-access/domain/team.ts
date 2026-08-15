export interface Team {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  ownerId: string | null;
  parentTeamId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Stability-guaranteed shape per bcs/identity-access/CONTRACT.md — Governance depends on its ordering. */
export interface TeamChainEntry {
  id: string;
  name: string;
  parentTeamId: string | null;
}

/** Thrown when a team is absent from the caller's organization. */
export class CrossOrgTeamAccessError extends Error {
  constructor() {
    super("No team found with this id in your organization.");
    this.name = "CrossOrgTeamAccessError";
  }
}

/** Thrown when a parent team belongs to a different organization than the child (FR-009). */
export class CrossOrgReparentError extends Error {
  constructor() {
    super("Cannot set a team's parent to a team in a different organization.");
    this.name = "CrossOrgReparentError";
  }
}

/** Thrown when a reparent would make a team a direct or indirect ancestor of itself (FR-010). */
export class CycleError extends Error {
  constructor() {
    super("This reparent would create a cycle in the team hierarchy.");
    this.name = "CycleError";
  }
}

/** Thrown when a team's slug collides with another team in the same organization (019-account-team-settings-ui). */
export class DuplicateTeamSlugError extends Error {
  constructor() {
    super("A team with this slug already exists in this organization.");
    this.name = "DuplicateTeamSlugError";
  }
}
