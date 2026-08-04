import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { join } from "node:path";

export interface Credentials {
  apiKey: string;
}

const CREDENTIALS_RELATIVE_PATH = join(".skillcanon", "credentials.json");

/**
 * FR-003: the raw key must never appear in a log line or thrown error
 * message anywhere in this module.
 */
export function writeCredentials(repoRoot: string, apiKey: string): void {
  const dir = join(repoRoot, ".skillcanon");
  mkdirSync(dir, { recursive: true });
  const path = join(repoRoot, CREDENTIALS_RELATIVE_PATH);
  writeFileSync(path, `${JSON.stringify({ apiKey } satisfies Credentials, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(path, 0o600);
}

export function readCredentials(repoRoot: string): Credentials {
  const path = join(repoRoot, CREDENTIALS_RELATIVE_PATH);
  if (!existsSync(path)) {
    throw new Error("No SkillCanon credentials found in this repository. Run `skillcanon init` first.");
  }
  return JSON.parse(readFileSync(path, "utf8")) as Credentials;
}
