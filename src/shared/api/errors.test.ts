import { z, ZodError } from "zod";
import { describe, expect, it } from "vitest";
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
import { mapError, notFoundResponse } from "./errors";

const CASES: Array<[string, Error, string, number]> = [
  ["CrossOrgReparentError", new CrossOrgReparentError(), "CROSS_ORG_REPARENT", 404],
  ["CycleError", new CycleError(), "TEAM_HIERARCHY_CYCLE", 422],
  ["DuplicateTeamSlugError", new DuplicateTeamSlugError(), "TEAM_SLUG_CONFLICT", 409],
  ["DuplicateUserError", new DuplicateUserError("email"), "USER_CONFLICT", 409],
  ["InvalidTeamAssignmentError", new InvalidTeamAssignmentError(), "INVALID_TEAM_ASSIGNMENT", 422],
  ["WeakPasswordError", new WeakPasswordError(), "WEAK_PASSWORD", 422],
  ["LastActiveAdminError", new LastActiveAdminError(), "LAST_ACTIVE_ADMIN", 409],
  ["NotAuthorizedError", new NotAuthorizedError(), "NOT_AUTHORIZED", 403],
  ["CrossOrgUserAccessError", new CrossOrgUserAccessError(), "CROSS_ORG_USER_ACCESS", 404],
  ["EntitlementRequiredError", new EntitlementRequiredError("chain_runs"), "ENTITLEMENT_REQUIRED", 403],
  ["NoScopesSelectedError", new NoScopesSelectedError(), "API_KEY_NO_SCOPES", 422],
  ["InvalidScopeError", new InvalidScopeError("bogus"), "API_KEY_INVALID_SCOPE", 422],
  ["ScopeExceedsPermissionsError", new ScopeExceedsPermissionsError("teams:write"), "API_KEY_SCOPE_EXCEEDS_ROLE", 422],
  ["ApiKeyNotFoundError", new ApiKeyNotFoundError(), "API_KEY_NOT_FOUND", 404],
  ["InvalidPolicyScopeError", new InvalidPolicyScopeError(), "INVALID_POLICY_SCOPE", 422],
  ["PolicyScopeNotFoundError", new PolicyScopeNotFoundError(), "POLICY_SCOPE_NOT_FOUND", 404],
  ["PolicyNotFoundError", new PolicyNotFoundError("policy-id"), "POLICY_NOT_FOUND", 404],
  ["InvalidObjectiveInputError", new InvalidObjectiveInputError(), "INVALID_OBJECTIVE_INPUT", 422],
  ["ObjectiveScopeNotFoundError", new ObjectiveScopeNotFoundError(), "OBJECTIVE_SCOPE_NOT_FOUND", 404],
  ["ObjectiveParentNotFoundError", new ObjectiveParentNotFoundError("parent-id"), "OBJECTIVE_PARENT_NOT_FOUND", 404],
  ["ObjectiveCycleError", new ObjectiveCycleError(), "OBJECTIVE_HIERARCHY_CYCLE", 422],
  ["ObjectiveNotFoundError", new ObjectiveNotFoundError("objective-id"), "OBJECTIVE_NOT_FOUND", 404],
  ["DuplicateProjectNameError", new DuplicateProjectNameError("name"), "PROJECT_NAME_CONFLICT", 409],
  ["DuplicateProjectSlugError", new DuplicateProjectSlugError("slug"), "PROJECT_SLUG_CONFLICT", 409],
  ["ProjectNotFoundError", new ProjectNotFoundError("project-id"), "PROJECT_NOT_FOUND", 404],
  ["ProjectOrganizationNotFoundError", new ProjectOrganizationNotFoundError("org-id"), "PROJECT_ORGANIZATION_NOT_FOUND", 404],
  ["ProjectUserNotFoundError", new ProjectUserNotFoundError("user-id"), "PROJECT_USER_NOT_FOUND", 404],
  ["ProjectTeamNotFoundError", new ProjectTeamNotFoundError("team-id"), "PROJECT_TEAM_NOT_FOUND", 404],
  ["DuplicateProjectMemberError", new DuplicateProjectMemberError("project-id", "user-id"), "PROJECT_MEMBER_CONFLICT", 409],
  ["ProjectMemberNotFoundError", new ProjectMemberNotFoundError("project-id", "user-id"), "PROJECT_MEMBER_NOT_FOUND", 404],
  ["DuplicateCollaboratorTeamError", new DuplicateCollaboratorTeamError(), "COLLABORATOR_TEAM_CONFLICT", 409],
  ["CollaboratorTeamNotFoundError", new CollaboratorTeamNotFoundError(), "COLLABORATOR_TEAM_NOT_FOUND", 404],
  ["OwnerTeamCannotBeCollaboratorError", new OwnerTeamCannotBeCollaboratorError(), "OWNER_TEAM_CANNOT_BE_COLLABORATOR", 422],
  ["ProjectTeamOrgMismatchError", new ProjectTeamOrgMismatchError(), "PROJECT_TEAM_ORG_MISMATCH", 404],
  ["DuplicateProjectRepoError", new DuplicateProjectRepoError("https://example.com/repo.git"), "PROJECT_REPO_CONFLICT", 409],
  ["ProjectRepoNotFoundError", new ProjectRepoNotFoundError("project-id", "repo-id"), "PROJECT_REPO_NOT_FOUND", 404],
  ["PromptNotFoundError", new PromptNotFoundError("skill-name"), "SKILL_NOT_FOUND", 404],
  ["DuplicatePromptNameError", new DuplicatePromptNameError("skill-name"), "SKILL_NAME_CONFLICT", 409],
  ["DuplicatePromptVersionError", new DuplicatePromptVersionError("skill-name", "1"), "SKILL_VERSION_CONFLICT", 409],
  ["PromptVersionNotFoundError", new PromptVersionNotFoundError("1"), "SKILL_VERSION_NOT_FOUND", 404],
  ["InvalidVersionShapeError", new InvalidVersionShapeError("neither template nor steps given"), "INVALID_SKILL_VERSION_SHAPE", 422],
  ["ExpansionSourceNotFoundError", new ExpansionSourceNotFoundError("skill-name"), "SKILL_EXPANSION_SOURCE_NOT_FOUND", 404],
  ["SourceSkillNotFoundError", new SourceSkillNotFoundError(), "SKILL_NOT_FOUND", 404],
  ["SubscriptionNotFoundError", new SubscriptionNotFoundError(), "SUBSCRIPTION_NOT_FOUND", 404],
  ["DuplicateSubscriptionError", new DuplicateSubscriptionError(), "SUBSCRIPTION_CONFLICT", 409],
  ["CrossOrgSubscriberError", new CrossOrgSubscriberError(), "CROSS_ORG_SUBSCRIBER", 404],
  ["CannotSubscribeToOwnSkillError", new CannotSubscribeToOwnSkillError(), "CANNOT_SUBSCRIBE_OWN_SKILL", 422],
  ["CannotForkOwnSkillError", new CannotForkOwnSkillError(), "CANNOT_FORK_OWN_SKILL", 422],
  ["SubscriberNotAuthorizedError", new SubscriberNotAuthorizedError(), "SUBSCRIBER_NOT_AUTHORIZED", 403],
  ["DuplicateProjectSkillAssignmentError", new DuplicateProjectSkillAssignmentError(), "PROJECT_SKILL_ASSIGNMENT_CONFLICT", 409],
  ["ProjectSkillAssignmentNotFoundError", new ProjectSkillAssignmentNotFoundError(), "PROJECT_SKILL_ASSIGNMENT_NOT_FOUND", 404],
  ["PersonalSkillNotAssignableError", new PersonalSkillNotAssignableError(), "PERSONAL_SKILL_NOT_ASSIGNABLE", 422],
  ["SkillNotEligibleForProjectError", new SkillNotEligibleForProjectError(), "SKILL_NOT_ELIGIBLE_FOR_PROJECT", 422],
  ["InvalidChainDependencyError", new InvalidChainDependencyError("step references itself"), "INVALID_CHAIN_DEPENDENCY", 422],
  ["ChainStepResolutionFailedError", new ChainStepResolutionFailedError("step-id", "skill-name", new Error("boom")), "CHAIN_STEP_RESOLUTION_FAILED", 422],
  ["RunNotFoundError", new RunNotFoundError("run-id"), "CHAIN_RUN_NOT_FOUND", 404],
  ["RunAlreadyFinishedError", new RunAlreadyFinishedError("run-id"), "CHAIN_RUN_ALREADY_FINISHED", 409],
  ["RunStepConflictError", new RunStepConflictError("run-id"), "CHAIN_RUN_STEP_CONFLICT", 409],
  ["NotAChainVersionError", new NotAChainVersionError("skill-name"), "NOT_A_CHAIN_VERSION", 422],
  ["ReportOutputTooLargeError", new ReportOutputTooLargeError(999_999), "CHAIN_STEP_OUTPUT_TOO_LARGE", 422],
];

describe("mapError", () => {
  it.each(CASES)("maps %s to {code: %s, status: %i}", (_label, instance, code, status) => {
    const mapped = mapError(instance);
    expect(mapped.status).toBe(status);
    expect(mapped.body.error.code).toBe(code);
    expect(mapped.body.error.message).toBe(instance.message);
  });

  it("maps a ZodError to 422 VALIDATION_FAILED with field errors", () => {
    const schema = z.object({ name: z.string().min(1) });
    const result = schema.safeParse({ name: "" });
    expect(result.success).toBe(false);
    const mapped = mapError(result.error as ZodError);
    expect(mapped.status).toBe(422);
    expect(mapped.body.error.code).toBe("VALIDATION_FAILED");
    expect(mapped.body.error.details?.fieldErrors).toBeDefined();
  });

  it("maps an unrecognized error to 500 INTERNAL_ERROR with no leaked internals", () => {
    const mapped = mapError(new Error("raw db connection string leaked here"));
    expect(mapped.status).toBe(500);
    expect(mapped.body.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(mapped.body)).not.toContain("raw db connection string");
  });

  it("maps a non-Error thrown value to 500 INTERNAL_ERROR", () => {
    const mapped = mapError("a bare string throw");
    expect(mapped.status).toBe(500);
    expect(mapped.body.error.code).toBe("INTERNAL_ERROR");
  });
});

describe("notFoundResponse", () => {
  it("produces the same envelope shape as a registered not-found class", () => {
    const manufactured = notFoundResponse("TEAM_NOT_FOUND", "Team not found");
    expect(manufactured.status).toBe(404);
    expect(manufactured.body).toEqual({
      error: { code: "TEAM_NOT_FOUND", message: "Team not found" },
    });
  });
});
