/**
 * Domain types, validation, and errors for chain versions and their runs
 * (PDR-017, 026-skill-chains). A chain version is a `PromptVersion` whose
 * content is an ordered list of `ChainStep`s instead of a template — see
 * `domain/prompt.ts`'s `determinePromptVersionKind` for the discriminant.
 */

// ---------------------------------------------------------------------------
// Chain step shape (stored inside prompt_versions.steps)
// ---------------------------------------------------------------------------

export interface ChainStep {
  id: string;
  promptName: string;
  promptVersion?: string;
  dependsOn: string[];
}

/**
 * Validates a chain's step list at run-start time only (never at publish
 * time — a chain's steps are stored exactly as submitted, per FR-002).
 * Rejects: a duplicate step id, a `dependsOn` reference to a nonexistent
 * step id, a step's own id, or a step at the same or later array position.
 * Chain resolution order is strictly sequential by position (CONTRACT.md
 * Stability Guarantees), so "no forward/self reference" is the entire
 * cycle-prevention rule — no separate graph traversal is needed.
 */
export function validateChainSteps(steps: ChainStep[]): void {
  const idToIndex = new Map<string, number>();
  steps.forEach((step, i) => {
    if (idToIndex.has(step.id)) {
      throw new InvalidChainDependencyError(`Duplicate step id "${step.id}".`);
    }
    idToIndex.set(step.id, i);
  });

  steps.forEach((step, i) => {
    for (const depId of step.dependsOn) {
      if (depId === step.id) {
        throw new InvalidChainDependencyError(
          `Step "${step.id}" cannot depend on itself.`,
        );
      }
      const depIndex = idToIndex.get(depId);
      if (depIndex === undefined) {
        throw new InvalidChainDependencyError(
          `Step "${step.id}" depends on nonexistent step id "${depId}".`,
        );
      }
      if (depIndex >= i) {
        throw new InvalidChainDependencyError(
          `Step "${step.id}" depends on step "${depId}", which is not strictly earlier in the chain.`,
        );
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Run-time step report / resolution shapes
// ---------------------------------------------------------------------------

export interface ChainStepReport {
  /**
   * The step index this report is for — required so `advanceSkillChainRun`
   * can tell "report for a step that's no longer pending" (a stale/racing
   * duplicate, FR-007a) apart from "report for the actual current step"
   * without relying on request timing alone (research.md — a real gap in
   * CONTRACT.md's originally documented `{status, output?, error?}` shape,
   * corrected during implementation once it became clear two concurrent
   * calls could otherwise silently misapply a stale report to whatever
   * step had newly become pending).
   */
  stepIndex: number;
  status: "success" | "error";
  output?: string;
  error?: string;
}

export interface ChainStepResolution {
  stepId: string;
  stepIndex: number;
  promptName: string;
  promptVersion: string;
  systemMessage: string | null;
  userMessage: string;
}

/** Per-dependency envelope threaded into a step's `expand()` input (research.md). */
export interface ChainStepDependencyValue {
  status: "success" | "error";
  output: string | null;
}

export type RunStatus = "in_progress" | "completed" | "failed" | "abandoned";

export type StartRunResult =
  | { runId: string; step: ChainStepResolution }
  | { runId: string; done: true };

export type AdvanceRunResult = { step: ChainStepResolution } | { done: true };

export interface ChainRunSummary {
  id: string;
  promptId: string;
  userId: string;
  status: RunStatus;
  currentStepIndex: number;
  startedAt: Date;
  completedAt: Date | null;
}

export interface ChainRunStepRecord {
  id: string;
  runId: string;
  stepIndex: number;
  promptName: string;
  promptVersion: string;
  resolvedAt: Date;
  systemMessage: string | null;
  userMessage: string;
  appliedPolicies: string[];
  objectives: string[];
  reportedStatus: "success" | "error" | null;
  reportedOutput: string | null;
  reportedError: string | null;
}

/** A caller-supplied step result larger than this is rejected outright (FR-014), never truncated. */
export const MAX_REPORT_OUTPUT_BYTES = 65536;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class InvalidChainDependencyError extends Error {
  constructor(detail: string) {
    super(`Invalid chain step dependencies: ${detail}`);
    this.name = "InvalidChainDependencyError";
  }
}

export class NotAChainVersionError extends Error {
  constructor(promptName: string) {
    super(`"${promptName}" does not resolve to a chain version.`);
    this.name = "NotAChainVersionError";
  }
}

export class RunNotFoundError extends Error {
  constructor(runId: string) {
    super(`No chain run "${runId}" found in the caller's organization.`);
    this.name = "RunNotFoundError";
  }
}

export class RunAlreadyFinishedError extends Error {
  constructor(runId: string) {
    super(`Chain run "${runId}" has already finished.`);
    this.name = "RunAlreadyFinishedError";
  }
}

export class RunStepConflictError extends Error {
  constructor(runId: string) {
    super(`Chain run "${runId}" was concurrently advanced by another call.`);
    this.name = "RunStepConflictError";
  }
}

/**
 * FR-011: the system itself could not produce a step's content (e.g. the
 * step's target skill was deprecated/deleted after the chain was
 * published) — distinct from a caller-reported step failure. No
 * `skill_chain_run_steps` row is ever created for the step that failed to
 * resolve, since no content was ever sent for the caller to report on.
 */
export class ChainStepResolutionFailedError extends Error {
  constructor(stepId: string, promptName: string, cause: unknown) {
    super(
      `Chain step "${stepId}" (skill "${promptName}") could not be resolved: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
    this.name = "ChainStepResolutionFailedError";
    this.cause = cause;
  }
}

/** FR-014: a caller-supplied step result exceeding MAX_REPORT_OUTPUT_BYTES. Rejected outright, never truncated. */
export class ReportOutputTooLargeError extends Error {
  constructor(actualBytes: number) {
    super(
      `Report output is ${actualBytes} bytes, exceeding the ${MAX_REPORT_OUTPUT_BYTES}-byte cap.`,
    );
    this.name = "ReportOutputTooLargeError";
  }
}
