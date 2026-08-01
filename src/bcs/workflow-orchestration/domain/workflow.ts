/**
 * A step's `promptName` is matched by name only against Prompt Registry,
 * and only at run time (FR-006) — never resolved or validated for
 * existence here. `dependsOn` is stored as submitted; this feature never
 * validates it for cycles or that referenced ids exist (FR-007) — that
 * belongs to the not-yet-built workflow-runner feature.
 */
export interface WorkflowStep {
  id: string;
  promptName: string;
  promptVersion?: string;
  dependsOn: string[];
}

export interface Workflow {
  id: string;
  organizationId: string;
  userId: string;
  projectId: string | null;
  name: string;
  description: string | null;
  steps: WorkflowStep[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWorkflowParams {
  name: string;
  description?: string | null;
  projectId?: string | null;
  steps?: unknown;
}

/**
 * Only `name`, `description`, and `steps` are accepted — `organizationId`,
 * `userId`, and `projectId` are fixed at creation and have no update path
 * (FR-013), enforced here at the type level rather than by a runtime check.
 * A field left out of this object leaves its stored value unchanged
 * (FR-012) — implemented as a `Partial`, not a nullable-required object.
 */
export interface UpdateWorkflowFields {
  name?: string;
  description?: string | null;
  steps?: unknown;
}

/**
 * Every listing mode from FR-009/FR-017/FR-018 gets its own explicit shape
 * rather than an all-optional `{userId?, projectId?}` bag, so "no user
 * filter" (rejected for non-admins per FR-017, allowed for admins per
 * FR-018) is never ambiguous with "defaulted to self."
 */
export type ListWorkflowsFilter =
  | { scope: "self"; projectId?: string }
  | { scope: "user"; userId: string; projectId?: string }
  | { scope: "project"; projectId: string }
  | { scope: "organization" };

export class WorkflowNotFoundError extends Error {
  constructor(workflowId: string) {
    super(`No workflow found with id "${workflowId}" in the caller's organization.`);
    this.name = "WorkflowNotFoundError";
  }
}

/** Thrown when a workflow's `projectId` does not belong to the same organization as the caller (FR-003). */
export class WorkflowProjectOrganizationMismatchError extends Error {
  constructor(projectId: string) {
    super(`No project found with id "${projectId}" in the caller's organization.`);
    this.name = "WorkflowProjectOrganizationMismatchError";
  }
}

/** Thrown when a step list is malformed: non-array, a malformed element, or a duplicate step id (FR-004, FR-005). */
export class InvalidWorkflowStepsError extends Error {
  constructor(reason: string) {
    super(`Invalid workflow steps: ${reason}`);
    this.name = "InvalidWorkflowStepsError";
  }
}

/** Thrown when the caller lacks permission for the requested operation (FR-014, FR-017). */
export class NotAuthorizedError extends Error {
  constructor() {
    super("You do not have permission to perform this action.");
    this.name = "NotAuthorizedError";
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Validates step shape only — never prompt existence, never dependency
 * cycles (FR-006, FR-007). Shared by `createWorkflow` and `updateWorkflow`
 * so the rule is enforced once, per Constitution D2.
 */
export function validateWorkflowSteps(input: unknown): WorkflowStep[] {
  if (input === undefined) {
    return [];
  }
  if (!Array.isArray(input)) {
    throw new InvalidWorkflowStepsError("steps must be an array.");
  }

  const seenIds = new Set<string>();
  const steps: WorkflowStep[] = [];

  for (const raw of input) {
    if (typeof raw !== "object" || raw === null) {
      throw new InvalidWorkflowStepsError("each step must be an object.");
    }
    const step = raw as Record<string, unknown>;

    if (!isNonEmptyString(step.id)) {
      throw new InvalidWorkflowStepsError("each step must have a non-empty string \"id\".");
    }
    if (seenIds.has(step.id)) {
      throw new InvalidWorkflowStepsError(`duplicate step id "${step.id}".`);
    }
    seenIds.add(step.id);

    if (!isNonEmptyString(step.promptName)) {
      throw new InvalidWorkflowStepsError(
        `step "${step.id}" must have a non-empty string "promptName".`,
      );
    }

    if (step.promptVersion !== undefined && typeof step.promptVersion !== "string") {
      throw new InvalidWorkflowStepsError(`step "${step.id}"'s "promptVersion" must be a string.`);
    }

    let dependsOn: string[] = [];
    if (step.dependsOn !== undefined) {
      if (!Array.isArray(step.dependsOn) || step.dependsOn.some((dep) => typeof dep !== "string")) {
        throw new InvalidWorkflowStepsError(
          `step "${step.id}"'s "dependsOn" must be an array of strings.`,
        );
      }
      dependsOn = step.dependsOn;
    }

    steps.push({
      id: step.id,
      promptName: step.promptName,
      promptVersion: step.promptVersion as string | undefined,
      dependsOn,
    });
  }

  return steps;
}
