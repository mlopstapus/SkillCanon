import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { resolveAllObjectives, resolveAllPolicies, type EffectivePolicy } from "@/bcs/governance";
import { ExpansionSourceNotFoundError, MAX_INCLUDE_DEPTH, type ExpandParams, type ExpansionResult } from "../domain/expansion";
import { extractIncludeReferences, renderWithIncludes, type IncludableVersion } from "../infrastructure/template-renderer";
import { findPromptByOrgAndName } from "../infrastructure/prompts-repo";
import { listVersionsByPrompt } from "../infrastructure/prompt-versions-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

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
 * Applies policy enforcement to the templates, exactly mirroring legacy's
 * `_apply_policies`: prepend content is repeatedly prepended in resolved-list
 * order (so, faithfully carried forward, the *last*-processed prepend policy
 * ends up outermost/first in the final text — a legacy quirk, not something
 * this port "fixes"), append content is repeatedly appended in the same
 * order, and inject content is joined and exposed as `templateVars.policies`
 * for the template to reference (never auto-inserted). A `validate`-type
 * policy is counted as applied but has no effect on output (spec
 * Assumptions — a known, pre-existing gap carried forward deliberately).
 */
function applyPolicies(
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
 * Renders a skill's active (or explicitly pinned) version against caller
 * input, weaving in the acting user's own effective Governance policies
 * (content changes) and objectives (template-visible context only), and
 * resolving template-invoked `include_prompt(...)` nested skill references
 * up to `MAX_INCLUDE_DEPTH`. A pure read — no audit write (research.md).
 *
 * Governance resolution, when an acting user is given, is scoped to that
 * user's own team chain only (PDR-016) — never the expanded skill's owning
 * team, never a project for policies (FR-010/FR-011). No acting user means
 * fully ungoverned; there is no fallback identity (FR-013).
 */
export async function expand(db: Db, params: ExpandParams): Promise<ExpansionResult> {
  const { organizationId, promptName, input, userId, projectId, version } = params;

  const topVersion = await fetchExpandableVersion(db, organizationId, promptName, version);
  // A chain version is rejected the same way any other unresolvable
  // version is — a caller cannot distinguish "this is a chain, use
  // startSkillChainRun instead" from "this doesn't exist" from expand()'s
  // error alone (PDR-017, CONTRACT.md).
  if (!topVersion || topVersion.kind === "chain") {
    throw new ExpansionSourceNotFoundError(promptName);
  }

  const templateVars: Record<string, unknown> = { ...input };

  let systemTpl: string | null = topVersion.systemTemplate;
  let userTpl: string = topVersion.userTemplate ?? "{{ input }}";
  let appliedPolicies: string[] = [];
  let objectives: string[] = [];

  if (userId) {
    const actor = { organizationId, userId };

    // No projectId — Policy has no project scope at all (PDR-016, FR-010/FR-015).
    const policies = await resolveAllPolicies(db, actor, userId);
    const applied = applyPolicies(systemTpl, userTpl, policies, templateVars);
    systemTpl = applied.systemTemplate;
    userTpl = applied.userTemplate;
    appliedPolicies = applied.appliedNames;

    // projectId forwarded here only — Objective kept its project scope (FR-015).
    objectives = await resolveAllObjectives(db, actor, userId, projectId);
    if (objectives.length > 0) {
      templateVars.objectives = objectives.join("\n");
    }
  }

  const promptCache = await prefetchIncludedVersions(db, organizationId, systemTpl, userTpl);

  const { systemMessage, userMessage } = renderWithIncludes(systemTpl, userTpl, templateVars, promptCache);

  return { systemMessage, userMessage, appliedPolicies, objectives };
}

/**
 * Breadth-first prefetch of every `include_prompt(...)`-referenced skill's
 * current active version, up to `MAX_INCLUDE_DEPTH` levels — a batching
 * optimization for `renderWithIncludes`, not itself the depth enforcement
 * (that lives in `template-renderer.ts`'s recursive `include_prompt`).
 * Faithful port of legacy's prefetch loop in `expand_prompt`. A referenced
 * name that resolves to nothing (nonexistent or deprecated) is simply
 * omitted from the cache — `include_prompt` then renders its own
 * not-found placeholder for that name.
 */
async function prefetchIncludedVersions(
  db: Db,
  organizationId: string,
  systemTpl: string | null,
  userTpl: string,
): Promise<Map<string, IncludableVersion>> {
  const referencedNames = new Set<string>([
    ...extractIncludeReferences(systemTpl),
    ...extractIncludeReferences(userTpl),
  ]);

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
        promptCache.set(refName, {
          systemTemplate: refVersion.systemTemplate,
          userTemplate: refVersion.userTemplate,
        });
        nextQueue.push(
          ...extractIncludeReferences(refVersion.systemTemplate),
          ...extractIncludeReferences(refVersion.userTemplate),
        );
      }
    }
    fetchQueue = nextQueue;
    if (fetchQueue.length === 0) {
      break;
    }
  }

  return promptCache;
}
