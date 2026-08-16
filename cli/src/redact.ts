/**
 * Defense-in-depth backstop (FR-003): even though credentials.ts/skillcanon-client.ts
 * never construct an error message containing the raw key, this redacts any
 * substring that looks like one before anything reaches stderr. Real keys are
 * `sk_` + 32 random bytes base64url-encoded (`create-api-key.ts`, ~43 chars) —
 * the {20,} minimum keeps this specific to that shape rather than any short,
 * incidental "sk_..." substring in unrelated error text.
 *
 * GitHub token prefixes (ghp_/github_pat_/gho_/ghu_/ghs_/ghr_) are redacted the
 * same way — npm-auth.ts (039-cli-distribution-publishing) reads a GitHub
 * Packages token from the local .npmrc, and a malformed-file error could
 * otherwise leak it into stderr.
 */
export function redact(message: string): string {
  return message
    .replace(/sk_[A-Za-z0-9_-]{20,}/g, "sk_***REDACTED***")
    .replace(/(ghp_|github_pat_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9_-]{20,}/g, "$1***REDACTED***");
}
