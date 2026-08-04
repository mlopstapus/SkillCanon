import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Idempotently ensures `entry` appears as its own line in the repo's `.gitignore`. */
export function ensureGitignoreEntry(repoRoot: string, entry: string): void {
  const path = join(repoRoot, ".gitignore");
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  const lines = existing.split("\n");
  if (lines.some((line) => line.trim() === entry)) return;

  const needsLeadingNewline = existing.length > 0 && !existing.endsWith("\n");
  writeFileSync(path, `${existing}${needsLeadingNewline ? "\n" : ""}${entry}\n`, "utf8");
}
