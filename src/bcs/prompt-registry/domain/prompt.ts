/** Domain types, errors, and interfaces for the Prompt & Version model. */

import type { ChainStep } from "./skill-chain";

export interface PromptActor {
  organizationId: string;
  userId: string;
}

// A skill (Prompt) is owned by exactly one user or exactly one team, never
// derived from a project (PDR-016).
export type PromptOwnerType = "user" | "team";

// ---------------------------------------------------------------------------
// Read summaries
// ---------------------------------------------------------------------------

export interface PromptSummary {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  isDeprecated: boolean;
  activeVersionId: string | null;
  ownerType: PromptOwnerType;
  ownerId: string;
  /** Lineage pointer, set only when this skill was created via forkSkill (future work). */
  forkedFromSkillId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type PromptVersionKind = "template" | "chain";

export interface PromptVersionSummary {
  id: string;
  promptId: string;
  version: string;
  /** Explicit discriminant (PDR-017) — never inferred from which fields are null. */
  kind: PromptVersionKind;
  systemTemplate: string | null;
  userTemplate: string | null;
  /** Non-null only when `kind === "chain"`. */
  steps: ChainStep[] | null;
  inputSchema: unknown;
  tags: unknown;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Write params
// ---------------------------------------------------------------------------

export interface CreatePromptParams {
  organizationId: string;
  name: string;
  description?: string | null;
}

export interface PublishVersionParams {
  promptName: string;
  organizationId: string;
  version: string;
  systemTemplate?: string | null;
  userTemplate?: string | null;
  /** A chain version's ordered step list — mutually exclusive with systemTemplate/userTemplate (PDR-017). */
  steps?: ChainStep[];
  inputSchema?: Record<string, unknown>;
  tags?: string[];
}

/**
 * Determines a version's `kind` from which shape the caller provided.
 * Exactly one of `steps` or non-null `systemTemplate`/`userTemplate` must
 * be given — both, or neither, is rejected (FR-001). `kind` itself is
 * never a caller-supplied field.
 */
export function determinePromptVersionKind(
  params: Pick<PublishVersionParams, "steps" | "systemTemplate" | "userTemplate">,
): PromptVersionKind {
  const hasSteps = params.steps !== undefined;
  const hasTemplateContent = params.systemTemplate != null || params.userTemplate != null;

  if (hasSteps && hasTemplateContent) {
    throw new InvalidVersionShapeError(
      "A version may specify either template content or chain steps, never both.",
    );
  }
  if (!hasSteps && !hasTemplateContent) {
    throw new InvalidVersionShapeError(
      "A version must specify either template content (systemTemplate/userTemplate) or chain steps.",
    );
  }
  return hasSteps ? "chain" : "template";
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class PromptNotFoundError extends Error {
  constructor(name: string) {
    super(`No prompt named "${name}" found in the caller's organization.`);
    this.name = "PromptNotFoundError";
  }
}

export class DuplicatePromptNameError extends Error {
  constructor(name: string) {
    super(`A prompt named "${name}" already exists in this organization.`);
    this.name = "DuplicatePromptNameError";
  }
}

export class DuplicatePromptVersionError extends Error {
  constructor(promptName: string, version: string) {
    super(`Version "${version}" already exists for prompt "${promptName}".`);
    this.name = "DuplicatePromptVersionError";
  }
}

export class PromptVersionNotFoundError extends Error {
  constructor(version: string) {
    super(`Version "${version}" was not found on this prompt.`);
    this.name = "PromptVersionNotFoundError";
  }
}

export class InvalidVersionShapeError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "InvalidVersionShapeError";
  }
}
