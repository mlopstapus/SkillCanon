import { ZodError } from "zod";
import {
  ApiKeyNotFoundError,
  CrossOrgReparentError,
  CrossOrgUserAccessError,
  CycleError,
  DuplicateTeamSlugError,
  DuplicateUserError,
  EntitlementRequiredError,
  InvalidScopeError,
  InvalidTeamAssignmentError,
  LastActiveAdminError,
  NoScopesSelectedError,
  NotAuthorizedError,
  ScopeExceedsPermissionsError,
  WeakPasswordError,
} from "@/bcs/identity-access";
import {
  InvalidObjectiveInputError,
  InvalidPolicyScopeError,
  ObjectiveCycleError,
  ObjectiveNotFoundError,
  ObjectiveParentNotFoundError,
  ObjectiveScopeNotFoundError,
  PolicyNotFoundError,
  PolicyScopeNotFoundError,
} from "@/bcs/governance";
import {
  CannotForkOwnSkillError,
  CannotSubscribeToOwnSkillError,
  ChainStepResolutionFailedError,
  CollaboratorTeamNotFoundError,
  CrossOrgSubscriberError,
  DuplicateCollaboratorTeamError,
  DuplicateProjectMemberError,
  DuplicateProjectNameError,
  DuplicateProjectRepoError,
  DuplicateProjectSkillAssignmentError,
  DuplicateProjectSlugError,
  DuplicatePromptNameError,
  DuplicatePromptVersionError,
  DuplicateSubscriptionError,
  ExpansionSourceNotFoundError,
  InvalidChainDependencyError,
  InvalidVersionFilesError,
  InvalidVersionShapeError,
  NotAChainVersionError,
  OwnerTeamCannotBeCollaboratorError,
  PersonalSkillNotAssignableError,
  ProjectMemberNotFoundError,
  ProjectNotFoundError,
  ProjectOrganizationNotFoundError,
  ProjectRepoNotFoundError,
  ProjectSkillAssignmentNotFoundError,
  ProjectTeamNotFoundError,
  ProjectTeamOrgMismatchError,
  ProjectUserNotFoundError,
  PromptNotFoundError,
  PromptVersionNotFoundError,
  ReportOutputTooLargeError,
  RunAlreadyFinishedError,
  RunNotFoundError,
  RunStepConflictError,
  SkillNotEligibleForProjectError,
  SourceSkillNotFoundError,
  SubscriberNotAuthorizedError,
  SubscriptionNotFoundError,
} from "@/bcs/prompt-registry";
import { getLogger } from "@/shared/logging";

const log = getLogger("distribution");

export interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface MappedError {
  status: number;
  body: ErrorBody;
}

interface RegistryEntry {
  ctor: new (...args: never[]) => Error;
  code: string;
  status: number;
}

/**
 * Every entry is an existing `extends Error` domain class, unchanged by
 * this feature — see data-model.md for the full rationale and the class
 * list grouped by bounded context. Order does not matter: lookup walks the
 * whole table and picks the first `instanceof` match, and no class here is
 * a subclass of another in this table.
 */
const REGISTRY: RegistryEntry[] = [
  // Identity & Access
  { ctor: CrossOrgReparentError, code: "CROSS_ORG_REPARENT", status: 404 },
  { ctor: CycleError, code: "TEAM_HIERARCHY_CYCLE", status: 422 },
  { ctor: DuplicateTeamSlugError, code: "TEAM_SLUG_CONFLICT", status: 409 },
  { ctor: DuplicateUserError, code: "USER_CONFLICT", status: 409 },
  { ctor: InvalidTeamAssignmentError, code: "INVALID_TEAM_ASSIGNMENT", status: 422 },
  { ctor: WeakPasswordError, code: "WEAK_PASSWORD", status: 422 },
  { ctor: LastActiveAdminError, code: "LAST_ACTIVE_ADMIN", status: 409 },
  { ctor: NotAuthorizedError, code: "NOT_AUTHORIZED", status: 403 },
  { ctor: CrossOrgUserAccessError, code: "CROSS_ORG_USER_ACCESS", status: 404 },
  { ctor: EntitlementRequiredError, code: "ENTITLEMENT_REQUIRED", status: 403 },
  { ctor: NoScopesSelectedError, code: "API_KEY_NO_SCOPES", status: 422 },
  { ctor: InvalidScopeError, code: "API_KEY_INVALID_SCOPE", status: 422 },
  { ctor: ScopeExceedsPermissionsError, code: "API_KEY_SCOPE_EXCEEDS_ROLE", status: 422 },
  { ctor: ApiKeyNotFoundError, code: "API_KEY_NOT_FOUND", status: 404 },

  // Governance
  { ctor: InvalidPolicyScopeError, code: "INVALID_POLICY_SCOPE", status: 422 },
  { ctor: PolicyScopeNotFoundError, code: "POLICY_SCOPE_NOT_FOUND", status: 404 },
  { ctor: PolicyNotFoundError, code: "POLICY_NOT_FOUND", status: 404 },
  { ctor: InvalidObjectiveInputError, code: "INVALID_OBJECTIVE_INPUT", status: 422 },
  { ctor: ObjectiveScopeNotFoundError, code: "OBJECTIVE_SCOPE_NOT_FOUND", status: 404 },
  { ctor: ObjectiveParentNotFoundError, code: "OBJECTIVE_PARENT_NOT_FOUND", status: 404 },
  { ctor: ObjectiveCycleError, code: "OBJECTIVE_HIERARCHY_CYCLE", status: 422 },
  { ctor: ObjectiveNotFoundError, code: "OBJECTIVE_NOT_FOUND", status: 404 },

  // Prompt Registry
  { ctor: DuplicateProjectNameError, code: "PROJECT_NAME_CONFLICT", status: 409 },
  { ctor: DuplicateProjectSlugError, code: "PROJECT_SLUG_CONFLICT", status: 409 },
  { ctor: ProjectNotFoundError, code: "PROJECT_NOT_FOUND", status: 404 },
  { ctor: ProjectOrganizationNotFoundError, code: "PROJECT_ORGANIZATION_NOT_FOUND", status: 404 },
  { ctor: ProjectUserNotFoundError, code: "PROJECT_USER_NOT_FOUND", status: 404 },
  { ctor: ProjectTeamNotFoundError, code: "PROJECT_TEAM_NOT_FOUND", status: 404 },
  { ctor: DuplicateProjectMemberError, code: "PROJECT_MEMBER_CONFLICT", status: 409 },
  { ctor: ProjectMemberNotFoundError, code: "PROJECT_MEMBER_NOT_FOUND", status: 404 },
  { ctor: DuplicateCollaboratorTeamError, code: "COLLABORATOR_TEAM_CONFLICT", status: 409 },
  { ctor: CollaboratorTeamNotFoundError, code: "COLLABORATOR_TEAM_NOT_FOUND", status: 404 },
  { ctor: OwnerTeamCannotBeCollaboratorError, code: "OWNER_TEAM_CANNOT_BE_COLLABORATOR", status: 422 },
  { ctor: ProjectTeamOrgMismatchError, code: "PROJECT_TEAM_ORG_MISMATCH", status: 404 },
  { ctor: DuplicateProjectRepoError, code: "PROJECT_REPO_CONFLICT", status: 409 },
  { ctor: ProjectRepoNotFoundError, code: "PROJECT_REPO_NOT_FOUND", status: 404 },
  { ctor: PromptNotFoundError, code: "SKILL_NOT_FOUND", status: 404 },
  { ctor: DuplicatePromptNameError, code: "SKILL_NAME_CONFLICT", status: 409 },
  { ctor: DuplicatePromptVersionError, code: "SKILL_VERSION_CONFLICT", status: 409 },
  { ctor: PromptVersionNotFoundError, code: "SKILL_VERSION_NOT_FOUND", status: 404 },
  { ctor: InvalidVersionShapeError, code: "INVALID_SKILL_VERSION_SHAPE", status: 422 },
  { ctor: InvalidVersionFilesError, code: "INVALID_SKILL_VERSION_FILES", status: 422 },
  { ctor: ExpansionSourceNotFoundError, code: "SKILL_EXPANSION_SOURCE_NOT_FOUND", status: 404 },
  { ctor: SourceSkillNotFoundError, code: "SKILL_NOT_FOUND", status: 404 },
  { ctor: SubscriptionNotFoundError, code: "SUBSCRIPTION_NOT_FOUND", status: 404 },
  { ctor: DuplicateSubscriptionError, code: "SUBSCRIPTION_CONFLICT", status: 409 },
  { ctor: CrossOrgSubscriberError, code: "CROSS_ORG_SUBSCRIBER", status: 404 },
  { ctor: CannotSubscribeToOwnSkillError, code: "CANNOT_SUBSCRIBE_OWN_SKILL", status: 422 },
  { ctor: CannotForkOwnSkillError, code: "CANNOT_FORK_OWN_SKILL", status: 422 },
  { ctor: SubscriberNotAuthorizedError, code: "SUBSCRIBER_NOT_AUTHORIZED", status: 403 },
  { ctor: DuplicateProjectSkillAssignmentError, code: "PROJECT_SKILL_ASSIGNMENT_CONFLICT", status: 409 },
  { ctor: ProjectSkillAssignmentNotFoundError, code: "PROJECT_SKILL_ASSIGNMENT_NOT_FOUND", status: 404 },
  { ctor: PersonalSkillNotAssignableError, code: "PERSONAL_SKILL_NOT_ASSIGNABLE", status: 422 },
  { ctor: SkillNotEligibleForProjectError, code: "SKILL_NOT_ELIGIBLE_FOR_PROJECT", status: 422 },
  { ctor: InvalidChainDependencyError, code: "INVALID_CHAIN_DEPENDENCY", status: 422 },
  { ctor: ChainStepResolutionFailedError, code: "CHAIN_STEP_RESOLUTION_FAILED", status: 422 },
  { ctor: RunNotFoundError, code: "CHAIN_RUN_NOT_FOUND", status: 404 },
  { ctor: RunAlreadyFinishedError, code: "CHAIN_RUN_ALREADY_FINISHED", status: 409 },
  { ctor: RunStepConflictError, code: "CHAIN_RUN_STEP_CONFLICT", status: 409 },
  { ctor: NotAChainVersionError, code: "NOT_A_CHAIN_VERSION", status: 422 },
  { ctor: ReportOutputTooLargeError, code: "CHAIN_STEP_OUTPUT_TOO_LARGE", status: 422 },
];

function errorBody(code: string, message: string, details?: Record<string, unknown>): ErrorBody {
  return details === undefined
    ? { error: { code, message } }
    : { error: { code, message, details } };
}

/** Manufactures the same envelope shape as `mapError`, for a `null`-returning BC read (data-model.md). */
export function notFoundResponse(code: string, message = "Not found"): MappedError {
  return { status: 404, body: errorBody(code, message) };
}

/**
 * Translates any thrown value into the one REST error shape every route
 * uses (FR-012/013/014). Never leaks `err.stack`/internal details for an
 * unrecognized error — only `code`/`message`/`details` reach the client;
 * the real error is logged server-side.
 */
export function mapError(err: unknown): MappedError {
  if (err instanceof ZodError) {
    const flattened = err.flatten();
    return {
      status: 422,
      body: errorBody("VALIDATION_FAILED", "Request validation failed", {
        fieldErrors: flattened.fieldErrors,
        formErrors: flattened.formErrors,
      }),
    };
  }

  for (const entry of REGISTRY) {
    if (err instanceof entry.ctor) {
      return {
        status: entry.status,
        body: errorBody(entry.code, err.message || entry.code),
      };
    }
  }

  log.error({ err }, "unhandled error in REST route");
  return {
    status: 500,
    body: errorBody("INTERNAL_ERROR", "An unexpected error occurred"),
  };
}
