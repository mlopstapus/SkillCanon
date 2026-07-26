export interface Objective {
  id: string;
  organizationId: string;
  teamId: string | null;
  projectId: string | null;
  userId: string | null;
  title: string;
  description: string | null;
  parentObjectiveId: string | null;
  isInherited: boolean;
  status: string;
  createdAt: Date;
}

export type EffectiveObjective = Objective & {
  isInherited: boolean;
};

export interface EffectiveObjectiveSet {
  inherited: EffectiveObjective[];
  local: EffectiveObjective[];
}

export interface ObjectiveActor {
  organizationId: string;
  userId: string;
}

export interface ObjectiveScopeVerifier {
  teamBelongsToOrganization?: (organizationId: string, teamId: string) => Promise<boolean>;
  projectBelongsToOrganization?: (organizationId: string, projectId: string) => Promise<boolean>;
  userBelongsToOrganization?: (organizationId: string, userId: string) => Promise<boolean>;
}

export interface CreateObjectiveParams {
  /** Optional for deterministic/import-style callers; generated when omitted. */
  id?: string;
  teamId?: string | null;
  projectId?: string | null;
  userId?: string | null;
  title: string;
  description?: string | null;
  parentObjectiveId?: string | null;
  status?: string;
}

export interface UpdateObjectiveFields {
  teamId?: string | null;
  projectId?: string | null;
  userId?: string | null;
  title?: string;
  description?: string | null;
  parentObjectiveId?: string | null;
  status?: string;
}

export class InvalidObjectiveInputError extends Error {
  constructor(message = "Objective input is invalid.") {
    super(message);
    this.name = "InvalidObjectiveInputError";
  }
}

export class ObjectiveScopeNotFoundError extends Error {
  constructor() {
    super("The supplied objective scope does not belong to the caller's organization.");
    this.name = "ObjectiveScopeNotFoundError";
  }
}

export class ObjectiveParentNotFoundError extends Error {
  constructor(parentObjectiveId: string) {
    super(`No parent objective found with id "${parentObjectiveId}" in the caller's organization.`);
    this.name = "ObjectiveParentNotFoundError";
  }
}

export class ObjectiveCycleError extends Error {
  constructor() {
    super("The supplied parent objective would create a cycle.");
    this.name = "ObjectiveCycleError";
  }
}

export class ObjectiveNotFoundError extends Error {
  constructor(objectiveId: string) {
    super(`No objective found with id "${objectiveId}" in the caller's organization.`);
    this.name = "ObjectiveNotFoundError";
  }
}

export function assertValidObjectiveTitle(title: string): void {
  if (title.trim().length === 0) {
    throw new InvalidObjectiveInputError("Objective title is required.");
  }
}
