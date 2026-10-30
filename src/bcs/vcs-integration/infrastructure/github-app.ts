import { createHmac, createSign, timingSafeEqual } from "node:crypto";
import { GithubApiError, GithubAppNotConfiguredError } from "../domain/installation";

export interface GithubAppConfig {
  appId: string;
  slug: string;
  privateKey: string;
  webhookSecret: string;
}

/** Reads the App settings from env; null (inert) unless all four are set. */
export function getGithubAppConfig(env: Record<string, string | undefined> = process.env): GithubAppConfig | null {
  const { GITHUB_APP_ID, GITHUB_APP_SLUG, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_WEBHOOK_SECRET } = env;
  if (!GITHUB_APP_ID || !GITHUB_APP_SLUG || !GITHUB_APP_PRIVATE_KEY || !GITHUB_APP_WEBHOOK_SECRET) return null;
  return {
    appId: GITHUB_APP_ID,
    slug: GITHUB_APP_SLUG,
    // Env files often carry the PEM on one line with literal "\n".
    privateKey: GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, "\n"),
    webhookSecret: GITHUB_APP_WEBHOOK_SECRET,
  };
}

export function requireGithubAppConfig(env?: Record<string, string | undefined>): GithubAppConfig {
  const config = getGithubAppConfig(env);
  if (!config) throw new GithubAppNotConfiguredError();
  return config;
}

const GITHUB_API = "https://api.github.com";
type FetchLike = typeof fetch;

const b64 = (value: string) => Buffer.from(value).toString("base64url");

/** Short-lived (10 min) RS256 JWT identifying the App itself to GitHub. */
export function createAppJwt(config: GithubAppConfig, now: number = Date.now()): string {
  const seconds = Math.floor(now / 1000);
  const unsigned = `${b64(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64(
    JSON.stringify({ iat: seconds - 60, exp: seconds + 540, iss: config.appId }),
  )}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(config.privateKey, "base64url");
  return `${unsigned}.${signature}`;
}

async function githubRequest(config: GithubAppConfig, path: string, init: RequestInit, fetchImpl: FetchLike) {
  const response = await fetchImpl(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      authorization: `Bearer ${createAppJwt(config)}`,
    },
  });
  if (!response.ok) throw new GithubApiError(response.status);
  return response.json() as Promise<Record<string, unknown>>;
}

/** Asks GitHub who an installation belongs to; also proves the id is real. */
export async function fetchInstallationAccount(
  config: GithubAppConfig,
  githubInstallationId: number,
  fetchImpl: FetchLike = fetch,
): Promise<{ login: string; type: "Organization" | "User" }> {
  const body = await githubRequest(config, `/app/installations/${githubInstallationId}`, { method: "GET" }, fetchImpl);
  const account = body.account as { login?: string; type?: string } | undefined;
  if (!account?.login || (account.type !== "Organization" && account.type !== "User")) {
    throw new GithubApiError(502);
  }
  return { login: account.login, type: account.type };
}

/** Mints a fresh installation access token. The caller uses it and drops it; it is never stored or logged. */
export async function mintInstallationToken(
  config: GithubAppConfig,
  githubInstallationId: number,
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  const body = await githubRequest(
    config,
    `/app/installations/${githubInstallationId}/access_tokens`,
    { method: "POST" },
    fetchImpl,
  );
  if (typeof body.token !== "string") throw new GithubApiError(502);
  return body.token;
}

/** Constant-time check of GitHub's `X-Hub-Signature-256` over the raw request body. */
export function verifyWebhookSignature(secret: string, rawBody: string, signatureHeader: string | null | undefined): boolean {
  if (!signatureHeader) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`);
  const given = Buffer.from(signatureHeader);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export interface GithubRepo {
  id: number;
  fullName: string;
}

/** Every repository an installation can see, via its short-lived token (paged, capped at 1000). */
export async function listInstallationRepositories(token: string, fetchImpl: FetchLike = fetch): Promise<GithubRepo[]> {
  const repos: GithubRepo[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const response = await fetchImpl(`${GITHUB_API}/installation/repositories?per_page=100&page=${page}`, {
      headers: { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new GithubApiError(response.status);
    const body = (await response.json()) as { repositories?: Array<{ id: number; full_name: string }> };
    const batch = body.repositories ?? [];
    repos.push(...batch.map((r) => ({ id: r.id, fullName: r.full_name })));
    if (batch.length < 100) break;
  }
  return repos;
}

const REPO_PATH = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

async function tokenRequest(token: string, path: string, init: RequestInit, fetchImpl: FetchLike) {
  const response = await fetchImpl(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      authorization: `Bearer ${token}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
    },
  });
  if (!response.ok) throw new GithubApiError(response.status);
  return response.json() as Promise<Record<string, unknown>>;
}

/** Commit shas of a pull request (GitHub caps this listing at 250 commits). */
export async function listPullRequestCommitShas(
  token: string,
  repoFullName: string,
  prNumber: number,
  fetchImpl: FetchLike = fetch,
): Promise<string[]> {
  if (!REPO_PATH.test(repoFullName)) throw new GithubApiError(400);
  const shas: string[] = [];
  for (let page = 1; page <= 3; page += 1) {
    const response = await fetchImpl(`${GITHUB_API}/repos/${repoFullName}/pulls/${prNumber}/commits?per_page=100&page=${page}`, {
      headers: { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new GithubApiError(response.status);
    const batch = (await response.json()) as Array<{ sha: string }>;
    shas.push(...batch.map((c) => c.sha));
    if (batch.length < 100) break;
  }
  return shas;
}

export interface CheckRunInput {
  name: string;
  headSha: string;
  conclusion: "success" | "failure" | "neutral";
  title: string;
  summary: string;
}

/** Creates a completed check run on a commit; returns its id. Never configured as a required check, so it cannot block a merge. */
export async function createCheckRun(token: string, repoFullName: string, input: CheckRunInput, fetchImpl: FetchLike = fetch): Promise<number> {
  if (!REPO_PATH.test(repoFullName)) throw new GithubApiError(400);
  const body = await tokenRequest(
    token,
    `/repos/${repoFullName}/check-runs`,
    {
      method: "POST",
      body: JSON.stringify({
        name: input.name,
        head_sha: input.headSha,
        status: "completed",
        conclusion: input.conclusion,
        output: { title: input.title, summary: input.summary },
      }),
    },
    fetchImpl,
  );
  if (typeof body.id !== "number") throw new GithubApiError(502);
  return body.id;
}

export async function updateCheckRun(token: string, repoFullName: string, checkRunId: number, input: CheckRunInput, fetchImpl: FetchLike = fetch): Promise<void> {
  if (!REPO_PATH.test(repoFullName)) throw new GithubApiError(400);
  await tokenRequest(
    token,
    `/repos/${repoFullName}/check-runs/${checkRunId}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        status: "completed",
        conclusion: input.conclusion,
        output: { title: input.title, summary: input.summary },
      }),
    },
    fetchImpl,
  );
}
