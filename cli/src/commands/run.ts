import type { Command } from "commander";
import { readProjectLink } from "../config/project-link.js";
import { readCredentials } from "../config/credentials.js";
import { readSyncManifest, writeSyncManifest } from "../config/sync-manifest.js";
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
  return (await runRunWithServe(repoRoot, slug)).text;
}

/** Like `runRun`, but also reports the serve line (stderr text) and remembers the serve in the sync manifest. */
export async function runRunWithServe(repoRoot: string, slug: string): Promise<{ text: string; serveLine?: string }> {
  const link = readProjectLink(repoRoot);
  const credentials = readCredentials(repoRoot);
  const result = await expandSkill({ server: link.server, apiKey: credentials.apiKey }, slug);
  const text = formatExpansion(result);
  if (!result.serveId || !result.contentDigest) return { text };
  const version = result.version ?? "unknown";
  const manifest = readSyncManifest(repoRoot);
  manifest.serves = { ...manifest.serves, [slug]: { serveId: result.serveId, version, contentDigest: result.contentDigest } };
  writeSyncManifest(repoRoot, manifest);
  return { text, serveLine: `[Serve ${result.serveId} · version ${version} · digest ${result.contentDigest}]` };
}

export function registerRunCommand(program: Command): void {
  program
    .command("run")
    .description("Resolve and print one governed skill's current content.")
    .argument("<slug>", "the skill's slug, e.g. release-notes")
    .action(async (slug: string) => {
      const { text, serveLine } = await runRunWithServe(process.cwd(), slug);
      process.stdout.write(`${text}\n`);
      // stderr, so the synced stub's stdout stays exactly the skill text.
      if (serveLine) process.stderr.write(`${serveLine}\n`);
    });
}
