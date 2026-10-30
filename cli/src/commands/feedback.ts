import type { Command } from "commander";
import { readProjectLink } from "../config/project-link.js";
import { readCredentials } from "../config/credentials.js";
import { readSyncManifest } from "../config/sync-manifest.js";
import { postFeedback } from "../http/skillcanon-client.js";

export interface FeedbackOptions {
  up?: boolean;
  down?: boolean;
  note?: string;
}

/**
 * `target` is a serve id, or a skill slug whose last `run` recorded a serve
 * in the sync manifest (016/001). `--note` makes it a note, otherwise a signal.
 */
export async function runFeedback(repoRoot: string, target: string, options: FeedbackOptions): Promise<void> {
  if (options.up && options.down) throw new Error("Pass either --up or --down, not both.");
  const rating = options.up ? "up" : options.down ? "down" : undefined;
  const text = options.note?.trim();
  if (!rating && !text) throw new Error("Give a rating (--up or --down) and/or a note (--note \"...\").");

  const link = readProjectLink(repoRoot);
  const credentials = readCredentials(repoRoot);
  const serveId = readSyncManifest(repoRoot).serves?.[target]?.serveId ?? target;
  await postFeedback(
    { server: link.server, apiKey: credentials.apiKey },
    { serveId, kind: text ? "note" : "signal", ...(rating ? { rating } : {}), ...(text ? { text } : {}) },
  );
}

export function registerFeedbackCommand(program: Command): void {
  program
    .command("feedback")
    .description("Tell a skill's owner how a run went, against the serve id `run` printed.")
    .argument("<serveId>", "a serve id, or a skill slug you ran earlier")
    .option("--up", "it worked")
    .option("--down", "it did not work")
    .option("--note <text>", "what failed or what to change")
    .action(async (target: string, opts: FeedbackOptions) => {
      await runFeedback(process.cwd(), target, opts);
      process.stdout.write("Feedback sent. Thank you.\n");
    });
}
