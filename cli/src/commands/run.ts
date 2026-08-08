import type { Command } from "commander";
import { readProjectLink } from "../config/project-link.js";
import { readCredentials } from "../config/credentials.js";
import { expandSkill, type ExpansionResult } from "../http/skillcanon-client.js";

/** Formats an ExpansionResult into the single block of text `run` prints. */
export function formatExpansion(result: ExpansionResult): string {
  return result.content;
}

/**
 * Resolves one governed prompt live (FR-008) — no caching anywhere in this
 * function or its callers. No `input` parameter (032-skill-file-format-refactor,
 * PDR-018) — a skill is invoked, not called with arguments.
 */
export async function runRun(repoRoot: string, slug: string): Promise<string> {
  const link = readProjectLink(repoRoot);
  const credentials = readCredentials(repoRoot);
  const result = await expandSkill({ server: link.server, apiKey: credentials.apiKey }, slug);
  return formatExpansion(result);
}

export function registerRunCommand(program: Command): void {
  program
    .command("run")
    .description("Resolve and print one governed skill's current content.")
    .argument("<slug>", "the skill's slug, e.g. release-notes")
    .action(async (slug: string) => {
      const text = await runRun(process.cwd(), slug);
      process.stdout.write(`${text}\n`);
    });
}
