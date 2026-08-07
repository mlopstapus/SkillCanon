/**
 * Nunjucks template-rendering setup for the Skill Expansion Engine
 * (021-expansion-engine). This is the only file in the codebase that
 * constructs a Nunjucks `Environment` directly — keeping the security-
 * sensitive configuration (S2: never expose an exec surface to template
 * content) isolated in one place.
 *
 * Faithful port of legacy's `_render_template`/`_build_include_prompt`
 * (`legacy/backend/src/spechub_server/services/prompt_service.py`).
 * Nunjucks has no literal `SandboxedEnvironment` class the way Python's
 * Jinja2 does (research.md) — "sandboxing" here means minimal surface area:
 * `throwOnUndefined: true` (Nunjucks' equivalent of Jinja2's
 * `StrictUndefined`) and registering **only** the one `include_prompt`
 * global this feature needs — never `require`, `process`, filesystem
 * access, or any other Node built-in.
 */
import nunjucks from "nunjucks";
import { MAX_INCLUDE_DEPTH } from "../domain/expansion";

/**
 * The minimal shape `include_prompt` needs from a referenced skill's
 * version — deliberately not the full `PromptVersionSummary`. Tagged union
 * (032-skill-file-format-refactor): a new-shape version contributes its
 * single resolved main-file content; a legacy-shape version keeps its old
 * two-part system+user shape, joined the same way it always has been.
 */
export type IncludableVersion =
  | { kind: "content"; content: string }
  | { kind: "legacy"; systemTemplate: string | null; userTemplate: string | null };

const INCLUDE_PROMPT_PATTERN = /include_prompt\(['"]([a-z0-9-]+)['"]\)/g;

/**
 * Regex-prescan a template's raw text for `include_prompt('name')`
 * references, mirroring legacy's `_prefetch_included_prompts`. Returns a
 * de-duplicated list of referenced skill names; an absent template
 * contributes nothing.
 */
export function extractIncludeReferences(templateStr: string | null | undefined): string[] {
  if (!templateStr) {
    return [];
  }
  const names = new Set<string>();
  for (const match of templateStr.matchAll(INCLUDE_PROMPT_PATTERN)) {
    const name = match[1];
    if (name) {
      names.add(name);
    }
  }
  return Array.from(names);
}

function createSandboxedEnvironment(): nunjucks.Environment {
  return new nunjucks.Environment(null, { autoescape: false, throwOnUndefined: true });
}

function renderTemplate(
  env: nunjucks.Environment,
  templateStr: string,
  variables: Record<string, unknown>,
): string {
  return env.renderString(templateStr, variables);
}

/**
 * Builds the recursive `include_prompt` global, exactly mirroring legacy's
 * `_build_include_prompt`: depth-exceeded and not-found both degrade to a
 * plain placeholder string rendered inline as output — never throw, never
 * abort the rest of expansion (FR-005/FR-006). Branches on the referenced
 * version's shape (032-skill-file-format-refactor, FR-008): a new-shape
 * inclusion renders its single content; a legacy-shape inclusion keeps the
 * existing two-part render-and-join.
 */
function buildIncludePrompt(
  promptCache: Map<string, IncludableVersion>,
  variables: Record<string, unknown>,
  depth: number,
): (name: string) => string {
  return function includePrompt(name: string): string {
    if (depth >= MAX_INCLUDE_DEPTH) {
      return `[include_prompt('${name}'): max depth (${MAX_INCLUDE_DEPTH}) exceeded]`;
    }
    const pv = promptCache.get(name);
    if (!pv) {
      return `[include_prompt('${name}'): prompt not found]`;
    }

    const innerEnv = createSandboxedEnvironment();
    const innerInclude = buildIncludePrompt(promptCache, variables, depth + 1);
    innerEnv.addGlobal("include_prompt", innerInclude);

    if (pv.kind === "content") {
      return renderTemplate(innerEnv, pv.content, variables);
    }

    const parts: string[] = [];
    if (pv.systemTemplate) {
      parts.push(renderTemplate(innerEnv, pv.systemTemplate, variables));
    }
    // "" not "{{ input }}" — see expand.ts's identical fix; no `input`
    // variable exists in scope for any caller anymore (FR-002).
    const userTpl = pv.userTemplate ?? "";
    parts.push(renderTemplate(innerEnv, userTpl, variables));
    return parts.join("\n\n");
  };
}

/**
 * Renders a skill's (already governance-modified, if applicable) system and
 * user templates, with `include_prompt` registered as a template global that
 * resolves nested skill references from `promptCache` (prefetched by the
 * caller via `extractIncludeReferences` + a BFS lookup, matching legacy's
 * `_prefetch_included_prompts` loop). Legacy-shape versions only
 * (032-skill-file-format-refactor) — see `renderContentWithIncludes` for
 * new-shape, single-content versions.
 */
export function renderWithIncludes(
  systemTemplate: string | null,
  userTemplate: string,
  variables: Record<string, unknown>,
  promptCache: Map<string, IncludableVersion>,
): { systemMessage: string | null; userMessage: string } {
  const env = createSandboxedEnvironment();
  const includeFn = buildIncludePrompt(promptCache, variables, 0);
  env.addGlobal("include_prompt", includeFn);

  const systemMessage = systemTemplate ? renderTemplate(env, systemTemplate, variables) : null;
  const userMessage = renderTemplate(env, userTemplate, variables);

  return { systemMessage, userMessage };
}

/**
 * Renders a new-shape version's single main-file content
 * (032-skill-file-format-refactor), with the same `include_prompt`
 * resolution as `renderWithIncludes`.
 */
export function renderContentWithIncludes(
  content: string,
  variables: Record<string, unknown>,
  promptCache: Map<string, IncludableVersion>,
): string {
  const env = createSandboxedEnvironment();
  const includeFn = buildIncludePrompt(promptCache, variables, 0);
  env.addGlobal("include_prompt", includeFn);
  return renderTemplate(env, content, variables);
}
