import type { Command } from "commander";
import { parseProjectKey, writeProjectLink } from "../config/project-link.js";
import { writeCredentials } from "../config/credentials.js";
import { listSkills } from "../http/skillcanon-client.js";
import { ensureGitignoreEntry } from "../gitignore.js";
import { ensureSessionStartHook } from "../integrations/claude-settings.js";
import { ensureAgentDocBlurb } from "../integrations/agent-docs.js";
import { runSync, type SyncResult } from "./sync.js";

export interface InitOptions {
  projectKey: string;
  apiKey: string;
}

export interface InitResult {
  sync: SyncResult;
}

/**
 * One-time repository setup (FR-001). Verifies the API key authenticates
 * against the parsed server *before* writing any config file, so a failed
 * init never leaves `.skillcanon/` in a half-written state (contracts/cli-commands.md).
 * Re-running is a safe, idempotent update (FR-015) — every write below is
 * already idempotent in its own module.
 */
export async function runInit(repoRoot: string, options: InitOptions): Promise<InitResult> {
  const link = parseProjectKey(options.projectKey);

  // Verify before persisting anything.
  await listSkills({ server: link.server, apiKey: options.apiKey }, link.projectId);

  writeProjectLink(repoRoot, link);
  writeCredentials(repoRoot, options.apiKey);
  ensureGitignoreEntry(repoRoot, ".skillcanon/credentials.json");
  ensureSessionStartHook(repoRoot);
  ensureAgentDocBlurb(repoRoot, "CLAUDE.md");
  ensureAgentDocBlurb(repoRoot, "AGENTS.md");

  const sync = await runSync(repoRoot);
  return { sync };
}

// Control-character key codes, expressed as escapes rather than literal
// bytes so the source file stays plain ASCII.
const KEY_EOF = String.fromCharCode(4); // Ctrl+D
const KEY_INTERRUPT = String.fromCharCode(3); // Ctrl+C
const KEY_DELETE = String.fromCharCode(127); // Backspace/DEL

async function promptForApiKey(): Promise<string> {
  process.stdout.write("API key: ");
  return await new Promise((resolve, reject) => {
    const stdin = process.stdin;
    let value = "";
    const wasRaw = stdin.isTTY ? stdin.isRaw : false;
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    const cleanup = () => {
      stdin.removeListener("data", onData);
      if (stdin.isTTY) stdin.setRawMode(wasRaw ?? false);
      stdin.pause();
    };

    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\n" || char === "\r" || char === KEY_EOF) {
          cleanup();
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (char === KEY_INTERRUPT) {
          cleanup();
          reject(new Error("Aborted."));
          return;
        }
        if (char === KEY_DELETE || char === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        value += char;
      }
    };

    stdin.on("data", onData);
  });
}

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Link this repository to a SkillCanon project.")
    .requiredOption("--project-key <url>", "the project's page URL, e.g. https://<host>/projects/<id>")
    .option("--api-key <key>", "API key (prompted for, without echo, if omitted)")
    .action(async (opts: { projectKey: string; apiKey?: string }) => {
      const apiKey = opts.apiKey ?? (await promptForApiKey());
      const result = await runInit(process.cwd(), { projectKey: opts.projectKey, apiKey });
      process.stdout.write(
        `Linked. Synced ${result.sync.created.length + result.sync.updated.length} skill(s) (${result.sync.created.length} new).\n`,
      );
    });
}
