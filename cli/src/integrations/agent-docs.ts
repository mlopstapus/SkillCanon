import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const START_MARKER = "<!-- skillcanon:start -->";
const END_MARKER = "<!-- skillcanon:end -->";

const BLURB = [
  START_MARKER,
  "This repository is connected to [SkillCanon](https://github.com/mlopstapus/SkillCanon), a governed prompt registry. " +
    "Governed prompts sync down as Claude Code skills automatically (see `.claude/skills/skillcanon-*/`) — " +
    "run `skillcanon sync` to force a refresh, or `skillcanon run <slug>` to resolve one directly.",
  END_MARKER,
].join("\n");

/**
 * Idempotently inserts/replaces the SkillCanon blurb between marker
 * comments in `fileName` (FR-011), creating the file if absent. Re-running
 * replaces only the content between the markers, never duplicates it.
 */
export function ensureAgentDocBlurb(repoRoot: string, fileName: string): void {
  const path = join(repoRoot, fileName);
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";

  const startIndex = existing.indexOf(START_MARKER);
  const endIndex = existing.indexOf(END_MARKER);

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    const before = existing.slice(0, startIndex);
    const after = existing.slice(endIndex + END_MARKER.length);
    writeFileSync(path, `${before}${BLURB}${after}`, "utf8");
    return;
  }

  const separator = existing.length > 0 && !existing.endsWith("\n\n") ? (existing.endsWith("\n") ? "\n" : "\n\n") : "";
  writeFileSync(path, `${existing}${separator}${BLURB}\n`, "utf8");
}
