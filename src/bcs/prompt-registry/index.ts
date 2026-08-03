export { addProjectMember } from "./application/add-project-member";
export { createProject } from "./application/create-project";
export { deleteProject } from "./application/delete-project";
export { getProject } from "./application/get-project";
export { listProjectMembers } from "./application/list-project-members";
export { listProjectsByOrganization, listProjectsByTeam } from "./application/list-projects";
export { removeProjectMember } from "./application/remove-project-member";
export { updateProject } from "./application/update-project";
export type {
  AddProjectMemberParams,
  CreateProjectParams,
  ProjectActor,
  ProjectIdentityVerifier,
  ProjectMemberSummary,
  ProjectSummary,
  UpdateProjectFields,
} from "./domain/project";
export {
  DuplicateProjectMemberError,
  DuplicateProjectNameError,
  DuplicateProjectSlugError,
  ProjectMemberNotFoundError,
  ProjectNotFoundError,
  ProjectOrganizationNotFoundError,
  ProjectTeamNotFoundError,
  ProjectUserNotFoundError,
} from "./domain/project";

// ---------------------------------------------------------------------------
// Prompt & Version Model (feature 018-prompt-version-model)
// ---------------------------------------------------------------------------
export { createPrompt } from "./application/create-prompt";
export { deprecatePrompt } from "./application/deprecate-prompt";
export { getPrompt } from "./application/get-prompt";
export { getPromptById } from "./application/get-prompt-by-id";
export { getPromptVersion } from "./application/get-prompt-version";
export { listPrompts } from "./application/list-prompts";
export type { ListPromptsOptions } from "./application/list-prompts";
export { listVersions } from "./application/list-versions";
export { publishVersion } from "./application/publish-version";
export { reactivatePrompt } from "./application/reactivate-prompt";
export { rollbackPrompt } from "./application/rollback-prompt";
export type {
  CreatePromptParams,
  PromptActor,
  PromptOwnerType,
  PromptSummary,
  PromptVersionSummary,
  PublishVersionParams,
} from "./domain/prompt";
export {
  DuplicatePromptNameError,
  DuplicatePromptVersionError,
  PromptNotFoundError,
  PromptVersionNotFoundError,
} from "./domain/prompt";

// ---------------------------------------------------------------------------
// Skill Expansion Engine (feature 021-expansion-engine)
// ---------------------------------------------------------------------------
export { expand, fetchExpandableVersion } from "./application/expand";
export type { ExpandParams, ExpansionResult } from "./domain/expansion";
export { ExpansionSourceNotFoundError, MAX_INCLUDE_DEPTH } from "./domain/expansion";

// ---------------------------------------------------------------------------
// Skill Sharing — Subscribe & Fork (feature 020-prompt-sharing, PDR-016)
// ---------------------------------------------------------------------------
export { forkSkill } from "./application/fork-skill";
export { listSkillsByOrganization } from "./application/list-skills-by-organization";
export { listSubscriptionsForSkill } from "./application/list-subscriptions-for-skill";
export { subscribeSkill } from "./application/subscribe-skill";
export { unsubscribeSkill } from "./application/unsubscribe-skill";
export type {
  ForkSkillParams,
  OwnerType,
  SubscribeSkillParams,
  Subscription,
  SubscriberType,
} from "./domain/subscription";
export {
  CannotForkOwnSkillError,
  CannotSubscribeToOwnSkillError,
  CrossOrgSubscriberError,
  DuplicateSubscriptionError,
  SourceSkillNotFoundError,
  SubscriberNotAuthorizedError,
  SubscriptionNotFoundError,
} from "./domain/subscription";

// ---------------------------------------------------------------------------
// Project Skill Assignment (feature 022-project-skill-assignment, PDR-016)
// ---------------------------------------------------------------------------
export { addCollaboratorTeam } from "./application/add-collaborator-team";
export { removeCollaboratorTeam } from "./application/remove-collaborator-team";
export { listProjectTeams } from "./application/list-project-teams";
export { addProjectRepo } from "./application/add-project-repo";
export { removeProjectRepo } from "./application/remove-project-repo";
export { listProjectRepos } from "./application/list-project-repos";
export type { AddProjectRepoParams, ProjectRepo } from "./domain/project-repo";
export { DuplicateProjectRepoError, ProjectRepoNotFoundError } from "./domain/project-repo";
export { assignSkillToProject } from "./application/assign-skill-to-project";
export { unassignSkillFromProject } from "./application/unassign-skill-from-project";
export { listRequiredSkillsForProject } from "./application/list-required-skills-for-project";
export { listProjectSkillAssignmentsForOrganization } from "./application/list-project-skill-assignments-for-organization";
export type { AddCollaboratorTeamParams, ProjectTeam } from "./domain/project-team";
export {
  CollaboratorTeamNotFoundError,
  DuplicateCollaboratorTeamError,
  OwnerTeamCannotBeCollaboratorError,
  ProjectTeamOrgMismatchError,
} from "./domain/project-team";
export type {
  AssignSkillToProjectParams,
  ProjectSkillAssignment,
  ProjectSkillRequirement,
} from "./domain/project-skill-assignment";
export {
  DuplicateProjectSkillAssignmentError,
  PersonalSkillNotAssignableError,
  ProjectSkillAssignmentNotFoundError,
  SkillNotEligibleForProjectError,
} from "./domain/project-skill-assignment";

// ---------------------------------------------------------------------------
// Project Usage Metrics Dashboard (feature 024-project-usage-metrics-dashboard)
// ---------------------------------------------------------------------------
export { getProjectMetrics } from "./application/get-project-metrics";
export type { ProjectMetrics } from "./domain/project-metrics";

// ---------------------------------------------------------------------------
// Skill Chains (feature 026-skill-chains, PDR-017)
// ---------------------------------------------------------------------------
export { determinePromptVersionKind } from "./domain/prompt";
export type { PromptVersionKind } from "./domain/prompt";
export { InvalidVersionShapeError } from "./domain/prompt";
export { startSkillChainRun } from "./application/start-skill-chain-run";
export { advanceSkillChainRun } from "./application/advance-skill-chain-run";
export { abandonSkillChainRun } from "./application/abandon-skill-chain-run";
export { listSkillChainRuns } from "./application/list-skill-chain-runs";
export { getSkillChainRun } from "./application/get-skill-chain-run";
export type {
  AdvanceRunResult,
  ChainRunStepRecord,
  ChainRunSummary,
  ChainStep,
  ChainStepDependencyValue,
  ChainStepReport,
  ChainStepResolution,
  RunStatus,
  StartRunResult,
} from "./domain/skill-chain";
export {
  ChainStepResolutionFailedError,
  InvalidChainDependencyError,
  MAX_REPORT_OUTPUT_BYTES,
  NotAChainVersionError,
  ReportOutputTooLargeError,
  RunAlreadyFinishedError,
  RunNotFoundError,
  RunStepConflictError,
  validateChainSteps,
} from "./domain/skill-chain";
