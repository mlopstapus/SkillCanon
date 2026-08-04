import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const SESSION_START_COMMAND = "skillcanon sync --quiet";

interface HookEntry {
  hooks: Array<{ type: string; command: string }>;
}

interface ClaudeSettings {
  hooks?: {
    SessionStart?: HookEntry[];
    [event: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Merges a SessionStart hook invoking `skillcanon sync --quiet` (research.md
 * D6) into the repo's project-local `.claude/settings.json`, creating the
 * file if absent and preserving any unrelated hooks/settings already there.
 * Idempotent: re-running does not duplicate the entry.
 */
export function ensureSessionStartHook(repoRoot: string): void {
  const dir = join(repoRoot, ".claude");
  const path = join(dir, "settings.json");

  const settings: ClaudeSettings = existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as ClaudeSettings) : {};
  settings.hooks ??= {};
  settings.hooks.SessionStart ??= [];

  const alreadyInstalled = settings.hooks.SessionStart.some((entry) =>
    entry.hooks.some((hook) => hook.command === SESSION_START_COMMAND),
  );
  if (alreadyInstalled) return;

  settings.hooks.SessionStart.push({ hooks: [{ type: "command", command: SESSION_START_COMMAND }] });

  mkdirSync(dir, { recursive: true });
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}
