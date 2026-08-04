export interface SkillSummary {
  name: string;
  description: string | null;
}

export interface ExpansionResult {
  systemMessage: string | null;
  userMessage: string;
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

export async function expandSkill(
  options: SkillCanonClientOptions,
  slug: string,
  input: Record<string, unknown>,
): Promise<ExpansionResult> {
  const response = await request(options, `/api/skills/${encodeURIComponent(slug)}/expand`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input }),
  });
  if (!response.ok) throwForStatus(response, slug);
  return (await response.json()) as ExpansionResult;
}
