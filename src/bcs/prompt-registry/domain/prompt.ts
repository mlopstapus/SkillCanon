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

/**
 * A named file (main or supporting) belonging to one template-kind version
 * (032-skill-file-format-refactor, PDR-018). `isMain` is true for exactly
 * one file per version — the required `SKILL.md`.
 */
export interface PromptVersionFile {
  id: string;
  name: string;
  content: string;
  isMain: boolean;
}

export interface PromptVersionSummary {
  id: string;
  promptId: string;
  version: string;
  /** Explicit discriminant (PDR-017) — never inferred from which fields are null. */
  kind: PromptVersionKind;
  /**
   * Legacy content (032-skill-file-format-refactor) — set only for a
   * version published before that feature shipped. `null` for any version
   * with a non-empty `files` array.
   */
  systemTemplate: string | null;
  userTemplate: string | null;
  /** Non-null only when `kind === "chain"`. */
  steps: ChainStep[] | null;
  /**
   * A template-kind version's file bundle (032-skill-file-format-refactor).
   * Empty for a legacy-shape version (see `systemTemplate`/`userTemplate`
   * above) and for every chain-kind version. "New-shape" is defined as
   * `files.some(f => f.isMain)`, not a separate stored flag.
   */
  files: PromptVersionFile[];
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

export interface PublishVersionFileInput {
  name: string;
  content: string;
}

export interface PublishVersionParams {
  promptName: string;
  organizationId: string;
  version: string;
  /**
   * Template-kind, new-shape content (032-skill-file-format-refactor).
   * Mutually exclusive with `steps` (PDR-017). No new version may be
   * published in the legacy `systemTemplate`/`userTemplate` shape — that
   * shape is read-only, carried only by versions published before this
   * feature shipped.
   */
  mainFile?: { content: string };
  supportingFiles?: PublishVersionFileInput[];
  /** A chain version's ordered step list — mutually exclusive with mainFile (PDR-017). */
  steps?: ChainStep[];
  tags?: string[];
}

/**
 * Determines a version's `kind` from which shape the caller provided.
 * Exactly one of `steps` or `mainFile` must be given — both, or neither, is
 * rejected (FR-001, FR-004). `kind` itself is never a caller-supplied field.
 */
export function determinePromptVersionKind(
  params: Pick<PublishVersionParams, "steps" | "mainFile">,
): PromptVersionKind {
  const hasSteps = params.steps !== undefined;
  const hasMainFile = params.mainFile !== undefined;

  if (hasSteps && hasMainFile) {
    throw new InvalidVersionShapeError(
      "A version may specify either a main file or chain steps, never both.",
    );
  }
  if (!hasSteps && !hasMainFile) {
    throw new InvalidVersionShapeError(
      "A version must specify either a main file (mainFile) or chain steps.",
    );
  }
  return hasSteps ? "chain" : "template";
}

/** Fixed name for a template-kind version's required main file (PDR-018). */
export const MAIN_FILE_NAME = "SKILL.md";

/** Enforced limits on a version's file bundle (research.md §6). */
export const MAX_FILE_SIZE_BYTES = 64 * 1024;
export const MAX_SUPPORTING_FILES = 20;

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

/**
 * Thrown for a template-kind version's file-bundle validation failures
 * (032-skill-file-format-refactor, FR-007): empty main file, a file over
 * `MAX_FILE_SIZE_BYTES`, a duplicate supporting-file name, or more than
 * `MAX_SUPPORTING_FILES` supporting files. The message names the specific
 * file and limit involved.
 */
export class InvalidVersionFilesError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "InvalidVersionFilesError";
  }
}
