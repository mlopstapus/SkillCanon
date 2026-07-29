/** Domain types, errors, and interfaces for the Prompt & Version model. */

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

export interface PromptVersionSummary {
  id: string;
  promptId: string;
  version: string;
  systemTemplate: string | null;
  userTemplate: string | null;
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
  inputSchema?: Record<string, unknown>;
  tags?: string[];
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
