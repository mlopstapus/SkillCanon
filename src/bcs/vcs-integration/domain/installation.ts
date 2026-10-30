import { createHmac, timingSafeEqual } from "node:crypto";

export interface Installation {
  id: string;
  organizationId: string;
  githubInstallationId: number;
  githubAccountLogin: string;
  githubAccountType: "Organization" | "User";
  suspendedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
}

export class GithubAppNotConfiguredError extends Error {
  constructor() {
    super("The GitHub App is not configured on this instance.");
    this.name = "GithubAppNotConfiguredError";
  }
}

export class InvalidInstallStateError extends Error {
  constructor() {
    super("The GitHub installation link is invalid or has expired. Start the install again from SkillCanon.");
    this.name = "InvalidInstallStateError";
  }
}

export class InstallationNotActiveError extends Error {
  constructor() {
    super("The GitHub installation is suspended, deleted, or unknown.");
    this.name = "InstallationNotActiveError";
  }
}

export class InstallationOwnedByAnotherOrganizationError extends Error {
  constructor() {
    super("That GitHub installation is already connected to a different organization.");
    this.name = "InstallationOwnedByAnotherOrganizationError";
  }
}

export class GithubApiError extends Error {
  // Status only: never echo a response body or request header that could carry a token.
  constructor(public readonly status: number) {
    super(`GitHub returned an unexpected response (HTTP ${status}).`);
    this.name = "GithubApiError";
  }
}

export const INSTALL_STATE_TTL_MS = 15 * 60 * 1000;

interface InstallStatePayload {
  org: string;
  user: string;
  exp: number;
}

const b64 = (s: string) => Buffer.from(s).toString("base64url");

function sign(payload: string, secret: string): string {
  return createHmac("sha256", `install-state:${secret}`).update(payload).digest("base64url");
}

/** A signed, expiring marker carrying the org and user that started an install. */
export function signInstallState(
  actor: { organizationId: string; userId: string },
  secret: string,
  now: number = Date.now(),
): string {
  const payload = b64(JSON.stringify({ org: actor.organizationId, user: actor.userId, exp: now + INSTALL_STATE_TTL_MS } satisfies InstallStatePayload));
  return `${payload}.${sign(payload, secret)}`;
}

/** Returns the signed payload, or throws `InvalidInstallStateError` for anything missing, altered or expired. */
export function verifyInstallState(
  state: string | null | undefined,
  secret: string,
  now: number = Date.now(),
): { organizationId: string; userId: string } {
  const [payload, signature] = (state ?? "").split(".");
  if (!payload || !signature) throw new InvalidInstallStateError();
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw new InvalidInstallStateError();
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as InstallStatePayload;
    if (typeof parsed.org !== "string" || typeof parsed.user !== "string" || typeof parsed.exp !== "number" || parsed.exp < now) {
      throw new InvalidInstallStateError();
    }
    return { organizationId: parsed.org, userId: parsed.user };
  } catch {
    throw new InvalidInstallStateError();
  }
}
