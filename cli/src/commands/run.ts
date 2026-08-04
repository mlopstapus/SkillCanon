import type { Command } from "commander";
import { readProjectLink } from "../config/project-link.js";
import { readCredentials } from "../config/credentials.js";
import { expandSkill, type ExpansionResult } from "../http/skillcanon-client.js";

/** Formats an ExpansionResult into the single block of text `run` prints. */
export function formatExpansion(result: ExpansionResult): string {
  return [result.systemMessage, result.userMessage].filter((part): part is string => Boolean(part)).join("\n\n");
}

/**
 * Resolves one governed prompt live (FR-008) — no caching anywhere in this
 * function or its callers.
 */
export async function runRun(repoRoot: string, slug: string, input: Record<string, unknown> = {}): Promise<string> {
  const link = readProjectLink(repoRoot);
  const credentials = readCredentials(repoRoot);
  const result = await expandSkill({ server: link.server, apiKey: credentials.apiKey }, slug, input);
  return formatExpansion(result);
}

export function parseInputFlag(raw: string | undefined): Record<string, unknown> {
  if (raw === undefined) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`--input must be valid JSON: "${raw}"`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("--input must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

export function registerRunCommand(program: Command): void {
  program
    .command("run")
    .description("Resolve and print one governed skill's current content.")
    .argument("<slug>", "the skill's slug, e.g. release-notes")
    .option("--input <json>", "JSON object of template variables (default: {})")
    .action(async (slug: string, opts: { input?: string }) => {
      const input = parseInputFlag(opts.input);
      const text = await runRun(process.cwd(), slug, input);
      process.stdout.write(`${text}\n`);
    });
}
