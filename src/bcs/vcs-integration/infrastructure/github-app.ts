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
