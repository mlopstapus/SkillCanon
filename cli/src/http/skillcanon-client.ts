/**
 * `kind` is deliberately not a field here: it lives per-version
 * (`prompt_versions.kind`), not on the prompt/skill row itself — a skill's
 * different versions can have different kinds. Resolve it from the active
 * version's own entry in `getSkillVersions()`'s response instead
 * (033-skill-file-format-cli-support).
 */
export interface SkillSummary {
  name: string;
  description: string | null;
  /** Null for a skill with no published version yet — never synced (033-skill-file-format-cli-support). */
  activeVersionId: string | null;
}

/** A named file (main or supporting) belonging to a template-kind version (032-skill-file-format-refactor). */
export interface SkillVersionFile {
  name: string;
  content: string;
  isMain: boolean;
}

export interface SkillVersion {
  id: string;
  kind: "template" | "chain";
  /** Empty for a chain-kind version, or a template-kind version published before 032-skill-file-format-refactor (legacy-shape). */
  files: SkillVersionFile[];
}

export interface ExpansionResult {
  content: string;
  appliedPolicies: string[];
  objectives: string[];
}

export interface SkillCanonClientOptions {
  server: string;
  apiKey: string;
}

/** Thrown when the request never reached the server (DNS/connection/timeout). */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super(`Could not reach the SkillCanon server: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "NetworkError";
  }
}

/** Thrown on a 401/403 response — invalid or expired API key. */
export class AuthError extends Error {
  constructor() {
    super("The stored API key was rejected (invalid or expired). Run `skillcanon init` again with a valid key.");
    this.name = "AuthError";
  }
}

/** Thrown on a 404 response — the prompt no longer exists. */
export class NotFoundError extends Error {
  constructor(slug: string) {
    super(`No skill named "${slug}" exists (it may have been renamed or deleted).`);
    this.name = "NotFoundError";
  }
}

/** Thrown on any other non-2xx response. */
export class ApiError extends Error {
  constructor(public readonly status: number) {
    super(`SkillCanon returned an unexpected error (HTTP ${status}).`);
    this.name = "ApiError";
  }
}

async function request(
  options: SkillCanonClientOptions,
  path: string,
  init: RequestInit,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${options.server}${path}`, {
      ...init,
      headers: { ...init.headers, authorization: `Bearer ${options.apiKey}` },
    });
  } catch (err) {
    throw new NetworkError(err);
  }
  return response;
}

function throwForStatus(response: Response, notFoundSlug?: string): never {
  if (response.status === 401 || response.status === 403) throw new AuthError();
  if (response.status === 404 && notFoundSlug) throw new NotFoundError(notFoundSlug);
  throw new ApiError(response.status);
}

export async function listSkills(options: SkillCanonClientOptions, projectId: string): Promise<SkillSummary[]> {
  const response = await request(options, `/api/skills?projectId=${encodeURIComponent(projectId)}`, {
    method: "GET",
  });
  if (!response.ok) throwForStatus(response);
  const body = (await response.json()) as { items: SkillSummary[] };
  return body.items;
}

/**
 * Every version for one skill, including each one's file bundle
 * (033-skill-file-format-cli-support) — the caller picks out the entry
 * matching the skill's own `activeVersionId`. No dedicated "active version
 * only" endpoint exists; this reuses the existing list route rather than
 * adding backend surface for a CLI-only need (research.md §1).
 */
export async function getSkillVersions(options: SkillCanonClientOptions, slug: string): Promise<SkillVersion[]> {
  const response = await request(options, `/api/skills/${encodeURIComponent(slug)}/versions`, {
    method: "GET",
  });
  if (!response.ok) throwForStatus(response, slug);
  return (await response.json()) as SkillVersion[];
}

/**
 * No `input` parameter (032-skill-file-format-refactor, PDR-018) — a skill
 * is invoked, not called with arguments, matching `expand()`'s own
 * contract.
 */
export async function expandSkill(
  options: SkillCanonClientOptions,
  slug: string,
): Promise<ExpansionResult> {
  const response = await request(options, `/api/skills/${encodeURIComponent(slug)}/expand`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!response.ok) throwForStatus(response, slug);
  return (await response.json()) as ExpansionResult;
}
