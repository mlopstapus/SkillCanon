import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { resolveAllObjectives, resolveAllPolicies, type EffectivePolicy } from "@/bcs/governance";
import { ExpansionSourceNotFoundError, MAX_INCLUDE_DEPTH, type ExpandParams, type ExpansionResult } from "../domain/expansion";
import type { PromptVersionSummary } from "../domain/prompt";
import {
  extractIncludeReferences,
  renderContentWithIncludes,
  renderWithIncludes,
  type IncludableVersion,
} from "../infrastructure/template-renderer";
import { findPromptByOrgAndName } from "../infrastructure/prompts-repo";
import { listVersionsByPrompt } from "../infrastructure/prompt-versions-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

/** True iff this template-kind version was published under the new markdown+files shape (032-skill-file-format-refactor). Legacy-shape versions have zero files. */
function isNewShape(version: PromptVersionSummary): boolean {
  return version.files.some((f) => f.isMain);
}

/**
 * Resolves the version to expand — the explicit `version` if given, else the
 * skill's current active version, else (no `activeVersionId` recorded, or it
 * points at a version no longer present) the most recently published one.
 * A nonexistent skill, one with zero published versions, or a deprecated
 * skill all resolve to `null` — faithful port of legacy's
 * `_fetch_prompt_version` (a single rejection path for all three, matching
 * FR-002's "deprecation blocks expansion unconditionally, including when a
 * specific still-existing version is explicitly requested").
 */
export async function fetchExpandableVersion(db: Db, organizationId: string, name: string, version?: string) {
  const prompt = await findPromptByOrgAndName(db, organizationId, name);
  if (!prompt || prompt.isDeprecated) {
    return null;
  }

  const versions = await listVersionsByPrompt(db, prompt.id);
  if (versions.length === 0) {
    return null;
  }

  if (version) {
    return versions.find((v) => v.version === version) ?? null;
  }

  if (prompt.activeVersionId) {
    const active = versions.find((v) => v.id === prompt.activeVersionId);
    if (active) {
      return active;
    }
  }

  // `listVersionsByPrompt` orders ascending by createdAt — the last entry is
  // the most recently published one, matching legacy's
  // `prompt.versions[0]` (a DESC-ordered relationship).
  return versions[versions.length - 1] ?? null;
}

/**
 * Applies policy enforcement to a legacy-shape version's system/user
 * templates, exactly mirroring legacy's `_apply_policies`: prepend content
 * is repeatedly prepended in resolved-list order (so, faithfully carried
 * forward, the *last*-processed prepend policy ends up outermost/first in
 * the final text — a legacy quirk, not something this port "fixes"),
 * append content is repeatedly appended in the same order, and inject
 * content is joined and exposed as `templateVars.policies` for the template
 * to reference (never auto-inserted). A `validate`-type policy is counted
 * as applied but has no effect on output (spec Assumptions — a known,
 * pre-existing gap carried forward deliberately).
 */
function applyPoliciesLegacy(
  systemTemplate: string | null,
  userTemplate: string,
  policies: EffectivePolicy[],
  templateVars: Record<string, unknown>,
): { systemTemplate: string | null; userTemplate: string; appliedNames: string[] } {
  const applied: string[] = [];
  const injectParts: string[] = [];
  let system = systemTemplate;
  let user = userTemplate;

  for (const policy of policies) {
    if (!policy.isActive) {
      continue;
    }
    applied.push(policy.name);
    if (policy.enforcementType === "prepend") {
      system = system !== null ? `${policy.content}\n\n${system}` : policy.content;
    } else if (policy.enforcementType === "append") {
      user = `${user}\n\n${policy.content}`;
    } else if (policy.enforcementType === "inject") {
      injectParts.push(policy.content);
    }
    // "validate" is handled post-render in legacy — no such handling exists
    // anywhere in that codebase either; faithfully not modifying templates.
  }

  if (injectParts.length > 0) {
    templateVars.policies = injectParts.join("\n");
  }

  return { systemTemplate: system, userTemplate: user, appliedNames: applied };
}

/**
 * Applies policy enforcement to a new-shape version's single main-file
 * content (032-skill-file-format-refactor, FR-009): prepend/append/inject
 * behave the same as the legacy path, collapsed onto one string — prepend
 * prepends, append appends, inject is exposed via `templateVars.policies`.
 */
function applyPoliciesToContent(
  content: string,
  policies: EffectivePolicy[],
  templateVars: Record<string, unknown>,
): { content: string; appliedNames: string[] } {
  const applied: string[] = [];
  const injectParts: string[] = [];
  let result = content;

  for (const policy of policies) {
    if (!policy.isActive) {
      continue;
    }
    applied.push(policy.name);
    if (policy.enforcementType === "prepend") {
      result = `${policy.content}\n\n${result}`;
    } else if (policy.enforcementType === "append") {
      result = `${result}\n\n${policy.content}`;
    } else if (policy.enforcementType === "inject") {
      injectParts.push(policy.content);
    }
  }

  if (injectParts.length > 0) {
    templateVars.policies = injectParts.join("\n");
  }

  return { content: result, appliedNames: applied };
}

/**
 * Renders a skill's active (or explicitly pinned) version, weaving in the
 * acting user's own effective Governance policies (content changes) and
 * objectives (template-visible context only), and resolving
 * template-invoked `include_prompt(...)` nested skill references up to
 * `MAX_INCLUDE_DEPTH`. A pure read — no audit write (research.md).
 *
 * No `input` parameter (032-skill-file-format-refactor, PDR-018) — a skill
 * is invoked, not called with arguments, for every caller including chain
 * steps (see `resolve-chain-step.ts`).
 *
 * Governance resolution, when an acting user is given, is scoped to that
 * user's own team chain only (PDR-016) — never the expanded skill's owning
 * team, never a project for policies (FR-010/FR-011). No acting user means
 * fully ungoverned; there is no fallback identity (FR-013).
 */
export async function expand(db: Db, params: ExpandParams): Promise<ExpansionResult> {
  const { organizationId, promptName, userId, projectId, version } = params;

  const topVersion = await fetchExpandableVersion(db, organizationId, promptName, version);
  // A chain version is rejected the same way any other unresolvable
  // version is — a caller cannot distinguish "this is a chain, use
  // startSkillChainRun instead" from "this doesn't exist" from expand()'s
  // error alone (PDR-017, CONTRACT.md).
  if (!topVersion || topVersion.kind === "chain") {
    throw new ExpansionSourceNotFoundError(promptName);
  }

  const templateVars: Record<string, unknown> = {};
  let appliedPolicies: string[] = [];
  let objectives: string[] = [];

  async function resolveGovernance() {
    if (!userId) {
      return;
    }
    const actor = { organizationId, userId };
    // No projectId — Policy has no project scope at all (PDR-016, FR-010/FR-015).
    objectives = await resolveAllObjectives(db, actor, userId, projectId);
    if (objectives.length > 0) {
      templateVars.objectives = objectives.join("\n");
    }
    return resolveAllPolicies(db, actor, userId);
  }

  if (isNewShape(topVersion)) {
    const mainFile = topVersion.files.find((f) => f.isMain);
    if (!mainFile) {
      throw new ExpansionSourceNotFoundError(promptName);
    }
    let content = mainFile.content;

    const policies = await resolveGovernance();
    if (policies) {
      const applied = applyPoliciesToContent(content, policies, templateVars);
      content = applied.content;
      appliedPolicies = applied.appliedNames;
    }

    const promptCache = await prefetchIncludedVersions(db, organizationId, [content]);
    const resolvedContent = renderContentWithIncludes(content, templateVars, promptCache);

    return { content: resolvedContent, appliedPolicies, objectives };
  }

  // Legacy-shape (032-skill-file-format-refactor, FR-010): resolve exactly
  // as before this feature shipped, then compose the two-part result into
  // the new single-`content` response shape (research.md §2). The old
  // "{{ input }}" default (rendered when no userTemplate was ever set) is
  // replaced with a plain "" — that placeholder only ever made sense when
  // a caller-supplied `input` object existed to substitute into it; since
  // `input` is gone for every caller (FR-002), rendering that literal
  // template string would throw (StrictUndefined) for a case this feature
  // itself created, not the separate, already-accepted PDR-018 risk of a
  // skill *author's own* `{{ var }}` usage elsewhere in stored content.
  let systemTpl: string | null = topVersion.systemTemplate;
  let userTpl: string = topVersion.userTemplate ?? "";

  const policies = await resolveGovernance();
  if (policies) {
    const applied = applyPoliciesLegacy(systemTpl, userTpl, policies, templateVars);
    systemTpl = applied.systemTemplate;
    userTpl = applied.userTemplate;
    appliedPolicies = applied.appliedNames;
  }

  const promptCache = await prefetchIncludedVersions(db, organizationId, [systemTpl, userTpl]);
  const { systemMessage, userMessage } = renderWithIncludes(systemTpl, userTpl, templateVars, promptCache);
  const content = systemMessage
    ? userMessage
      ? `${systemMessage}\n\n${userMessage}`
      : systemMessage
    : userMessage;

  return { content, appliedPolicies, objectives };
}

/**
 * Breadth-first prefetch of every `include_prompt(...)`-referenced skill's
 * current active version, up to `MAX_INCLUDE_DEPTH` levels — a batching
 * optimization for `renderWithIncludes`/`renderContentWithIncludes`, not
 * itself the depth enforcement (that lives in `template-renderer.ts`'s
 * recursive `include_prompt`). Faithful port of legacy's prefetch loop in
 * `expand_prompt`. A referenced name that resolves to nothing (nonexistent
 * or deprecated) is simply omitted from the cache — `include_prompt` then
 * renders its own not-found placeholder for that name. Builds the correct
 * `IncludableVersion` variant per referenced skill's own shape
 * (032-skill-file-format-refactor).
 */
async function prefetchIncludedVersions(
  db: Db,
  organizationId: string,
  sourceTemplates: Array<string | null>,
): Promise<Map<string, IncludableVersion>> {
  const referencedNames = new Set<string>();
  for (const tpl of sourceTemplates) {
    for (const name of extractIncludeReferences(tpl)) {
      referencedNames.add(name);
    }
  }

  const promptCache = new Map<string, IncludableVersion>();
  const seen = new Set<string>();
  let fetchQueue = Array.from(referencedNames);

  for (let level = 0; level < MAX_INCLUDE_DEPTH; level++) {
    const nextQueue: string[] = [];
    for (const refName of fetchQueue) {
      if (seen.has(refName)) {
        continue;
      }
      seen.add(refName);
      const refVersion = await fetchExpandableVersion(db, organizationId, refName);
      if (refVersion) {
        let nextTemplates: Array<string | null>;
        if (isNewShape(refVersion)) {
          const mainFile = refVersion.files.find((f) => f.isMain);
          const content = mainFile?.content ?? "";
          promptCache.set(refName, { kind: "content", content });
          nextTemplates = [content];
        } else {
          promptCache.set(refName, {
            kind: "legacy",
            systemTemplate: refVersion.systemTemplate,
            userTemplate: refVersion.userTemplate,
          });
          nextTemplates = [refVersion.systemTemplate, refVersion.userTemplate];
        }
        for (const tpl of nextTemplates) {
          nextQueue.push(...extractIncludeReferences(tpl));
        }
      }
    }
    fetchQueue = nextQueue;
    if (fetchQueue.length === 0) {
      break;
    }
  }

  return promptCache;
}
