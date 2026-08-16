import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const AUTH_TOKEN_LINE = /^\/\/npm\.pkg\.github\.com\/:_authToken=(.+)$/;

function readTokenFromFile(npmrcPath: string): string | null {
  if (!existsSync(npmrcPath)) return null;
  let contents: string;
  try {
    contents = readFileSync(npmrcPath, "utf8");
  } catch {
    return null;
  }
  for (const rawLine of contents.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith(";") || line.startsWith("#")) continue;
    const match = AUTH_TOKEN_LINE.exec(line);
    if (match) return (match[1] as string).trim();
  }
  return null;
}

/**
 * Reads the GitHub Packages registry auth token a person configured (via
 * `npm login`/`.npmrc`) to install the CLI in the first place — reused
 * read-only by the update check (039-cli-distribution-publishing D3). `cwd`'s
 * .npmrc takes precedence over `homeDir`'s, matching npm's own project-over-user
 * config precedence. Never throws — a missing/unreadable/malformed file is
 * indistinguishable from "no token configured" (research.md D3).
 */
export function readGithubPackagesToken(homeDir: string, cwd?: string): string | null {
  if (cwd) {
    const fromCwd = readTokenFromFile(join(cwd, ".npmrc"));
    if (fromCwd) return fromCwd;
  }
  return readTokenFromFile(join(homeDir, ".npmrc"));
}
