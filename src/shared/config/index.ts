const PLACEHOLDER_MARKER = "REPLACE_ME";

/**
 * Reads the JWT signing secret and fails loudly (constitution Principle VI /
 * FR-009) rather than silently signing with a missing or still-placeholder
 * value. Mirrors `shared/db/client.ts`'s `getConnectionString` exactly.
 * `env` defaults to `process.env` and is only overridden in tests.
 */
export function getJwtSecret(
  env: Record<string, string | undefined> = process.env,
): string {
  const value = env.JWT_SECRET;
  if (!value) {
    throw new Error(
      "JWT_SECRET is missing. Set it in your environment before starting the app (see .env.example).",
    );
  }
  if (value.includes(PLACEHOLDER_MARKER)) {
    throw new Error(
      "JWT_SECRET is still set to its documented placeholder value. Replace it with a real signing secret before starting the app.",
    );
  }
  return value;
}

/**
 * Session lifetime, hours. Defaults to 24 (matches the legacy system's
 * default) when unset — this env var has no placeholder-detection concern
 * of its own, unlike a secret.
 */
export function getJwtExpiryHours(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env.JWT_EXPIRY_HOURS;
  if (!raw) {
    return 24;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      "JWT_EXPIRY_HOURS must be a positive number when set. Got: " + raw,
    );
  }
  return parsed;
}

/**
 * Invitation token lifetime, hours. Defaults to 168 (7 days) when unset —
 * matches the legacy system's configurable-expiry behavior (009-invitations).
 */
export function getInvitationExpiryHours(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env.INVITATION_EXPIRY_HOURS;
  if (!raw) {
    return 168;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      "INVITATION_EXPIRY_HOURS must be a positive number when set. Got: " + raw,
    );
  }
  return parsed;
}

/** Base URL used to build links (e.g. invitation accept links) shared outside the app. */
export function getAppBaseUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  return env.APP_BASE_URL || "http://localhost:3000";
}

export interface SmtpConfig {
  host: string;
  port: number;
  user: string | undefined;
  pass: string | undefined;
  from: string;
}

/**
 * Generic self-host SMTP fallback per `context/third-party-services.md`.
 * Returns `null` when unconfigured — the caller (`shared/email`) treats
 * that as "log instead of send," never a startup failure (unlike
 * `getJwtSecret`, SMTP has no insecure-default concern to fail closed on).
 */
export function getSmtpConfig(
  env: Record<string, string | undefined> = process.env,
): SmtpConfig | null {
  const host = env.SMTP_HOST;
  if (!host) {
    return null;
  }
  return {
    host,
    port: env.SMTP_PORT ? Number(env.SMTP_PORT) : 587,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.SMTP_FROM || "no-reply@example.com",
  };
}

/**
 * Optional GitHub API token (013-skill-import-and-external-registries) —
 * unauthenticated requests to `api.github.com` work fine for public repos
 * but are capped at 60/hour per IP; setting this raises that limit. Returns
 * `null` when unset, which the caller treats as "call unauthenticated," not
 * a startup failure.
 */
export function getGithubToken(
  env: Record<string, string | undefined> = process.env,
): string | null {
  return env.GITHUB_TOKEN || null;
}
