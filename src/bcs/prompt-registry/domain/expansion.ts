/**
 * Domain types, constants, and errors for the Skill Expansion Engine
 * (021-expansion-engine) — a faithful port of legacy's `expand_prompt`
 * (`legacy/backend/src/spechub_server/services/prompt_service.py`).
 *
 * `expand()` itself lives in `application/expand.ts` (it needs Governance's
 * `resolveAllPolicies`/`resolveAllObjectives`, an application-layer, cross-BC
 * concern) — this file holds only the pure shapes/constants/errors that
 * don't require any cross-BC dependency, per D2 (domain invariants live in
 * the domain layer, not duplicated per caller).
 */

/**
 * Fixed nested skill-inclusion depth limit — matches legacy's hardcoded
 * `MAX_INCLUDE_DEPTH = 3` exactly (spec Assumptions: carried forward as-is,
 * not re-derived or made configurable by this feature).
 */
export const MAX_INCLUDE_DEPTH = 3;

export interface ExpandParams {
  organizationId: string;
  promptName: string;
  /**
   * Optional acting user. Omitted means fully ungoverned (FR-013) — no
   * fallback identity (PDR-016).
   *
   * No `input` field (032-skill-file-format-refactor, PDR-018): a skill is
   * invoked, not called with arguments — how the caller's request gets
   * incorporated is left to the model reading the resolved content.
   */
  userId?: string;
  /**
   * Optional project context. Forwarded only into objective resolution
   * (FR-015) — Policy has no project scope at all under PDR-016. Meaningless
   * without `userId` also given.
   */
  projectId?: string;
  /** Optional explicit version pin for the *top-level* skill only; nested inclusions always resolve to their own current active version. */
  version?: string;
}

export interface ExpansionResult {
  /**
   * The resolved content (032-skill-file-format-refactor): a new-shape
   * version's governance-modified main file, or — for a version published
   * before this feature shipped — its legacy system+user template
   * composed into a single string (research.md §2). Never empty for a
   * successfully resolved template-kind version.
   */
  content: string;
  /** Policy names actually applied; empty when no acting user or no effective policies. */
  appliedPolicies: string[];
  /** Objective titles resolved; empty when no acting user or no effective objectives. */
  objectives: string[];
}

/**
 * Thrown when the requested skill doesn't exist, has no published version
 * yet, or is deprecated — legacy rejects all three the same way (a single
 * `None` return from `_fetch_prompt_version`), including when a deprecated
 * skill's specific still-existing version is explicitly requested (FR-002).
 */
export class ExpansionSourceNotFoundError extends Error {
  constructor(promptName: string) {
    super(
      `No expandable skill named "${promptName}" found in the caller's organization (nonexistent, unpublished, or deprecated).`,
    );
    this.name = "ExpansionSourceNotFoundError";
  }
}
