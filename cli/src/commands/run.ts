import type { Command } from "commander";
import { readGitContext } from "../git-context.js";
import { readProjectLink } from "../config/project-link.js";
import { readCredentials } from "../config/credentials.js";
import { readSyncManifest, writeSyncManifest } from "../config/sync-manifest.js";
import {
  abandonChainRun,
  advanceChainRun,
  ApiError,
  expandSkill,
  getSkill,
  getSkillVersions,
  NotFoundError,
  startChainRun,
  type ChainProgress,
  type ChainStatusReport,
  type ExpansionResult,
  type SkillCanonClientOptions,
} from "../http/skillcanon-client.js";

/** Formats an ExpansionResult into the single block of text `run` prints. */
export function formatExpansion(result: ExpansionResult): string {
  return result.content;
}

/** Formats a started or advanced chain step into the text an agent follows. */
export function formatChainStep(runId: string, progress: ChainProgress): string {
  if ("done" in progress) return `Chain run ${runId} is complete.`;
  const { step } = progress;
  return [
    `Chain run ${runId}, step ${step.stepIndex + 1} (${step.stepId}: ${step.promptName})`,
    "",
    step.content,
    "",
    `When this step is done, report it: skillcanon advance ${runId} ${step.stepIndex} --status success --output "<what you produced>"`,
    `(use --status error --error "<why>" if it failed, or skillcanon abandon ${runId} to stop)`,
  ].join("\n");
}

async function isChain(options: SkillCanonClientOptions, slug: string): Promise<boolean> {
  const { activeVersionId } = await getSkill(options, slug);
  const versions = await getSkillVersions(options, slug);
  return versions.find((v) => v.id === activeVersionId)?.kind === "chain";
}

/**
 * Resolves one governed prompt live (FR-008) — no caching anywhere in this
 * function or its callers. A chain skill starts a run and prints step 1
 * instead (015/003); `advance` steps it on. Expand is tried first, so a
 * template skill costs one request; a chain is only detected when expand
 * refuses it (404, or 409/422 once the server names the chain-runs route).
 */
export async function runRun(repoRoot: string, slug: string): Promise<string> {
  return (await runRunWithServe(repoRoot, slug)).text;
}

/** Like `runRun`, but also reports the serve line (stderr text) and remembers the serve in the sync manifest. */
export async function runRunWithServe(repoRoot: string, slug: string): Promise<{ text: string; serveLine?: string }> {
  const link = readProjectLink(repoRoot);
  const credentials = readCredentials(repoRoot);
  const options = { server: link.server, apiKey: credentials.apiKey };
  try {
    const result = await expandSkill(options, slug, readGitContext(repoRoot));
    const text = formatExpansion(result);
    if (!result.serveId || !result.contentDigest) return { text };
    const version = result.version ?? "unknown";
    const manifest = readSyncManifest(repoRoot);
    manifest.serves = { ...manifest.serves, [slug]: { serveId: result.serveId, version, contentDigest: result.contentDigest } };
    writeSyncManifest(repoRoot, manifest);
    return { text, serveLine: `[Serve ${result.serveId} · version ${version} · digest ${result.contentDigest}]` };
  } catch (err) {
    const refused = err instanceof NotFoundError || (err instanceof ApiError && (err.status === 409 || err.status === 422));
    if (!refused) throw err;
    // Any failure while probing means it really isn't a chain: report the original error.
    const chain = await isChain(options, slug).catch(() => false);
    if (!chain) throw err;
    const { runId, ...progress } = await startChainRun(options, slug);
    return { text: formatChainStep(runId, progress as ChainProgress) };
  }
}

export async function runAdvance(
  repoRoot: string,
  runId: string,
  report: ChainStatusReport,
): Promise<string> {
  const link = readProjectLink(repoRoot);
  const credentials = readCredentials(repoRoot);
  return formatChainStep(runId, await advanceChainRun({ server: link.server, apiKey: credentials.apiKey }, runId, report));
}

export function registerRunCommand(program: Command): void {
  program
    .command("run")
    .description("Resolve and print one governed skill's current content (a chain skill starts a run and prints step 1).")
    .argument("<slug>", "the skill's slug, e.g. release-notes")
    .action(async (slug: string) => {
      const { text, serveLine } = await runRunWithServe(process.cwd(), slug);
      process.stdout.write(`${text}\n`);
      // stderr, so the synced stub's stdout stays exactly the skill text.
      if (serveLine) process.stderr.write(`${serveLine}\n`);
    });

  program
    .command("advance")
    .description("Report a chain step's result and print the next step.")
    .argument("<runId>", "the chain run id printed by `skillcanon run`")
    .argument("<stepIndex>", "the step index being reported (printed with the step)")
    .option("--status <status>", "success or error", "success")
    .option("--output <text>", "what the step produced")
    .option("--error <text>", "why the step failed")
    .action(async (runId: string, stepIndex: string, opts: { status: string; output?: string; error?: string }) => {
      if (opts.status !== "success" && opts.status !== "error") {
        throw new Error('--status must be "success" or "error".');
      }
      const index = Number(stepIndex);
      if (!Number.isInteger(index) || index < 0) throw new Error("stepIndex must be a non-negative integer.");
      const text = await runAdvance(process.cwd(), runId, {
        stepIndex: index,
        status: opts.status,
        output: opts.output,
        error: opts.error,
      });
      process.stdout.write(`${text}\n`);
    });

  program
    .command("abandon")
    .description("Stop a chain run.")
    .argument("<runId>", "the chain run id")
    .action(async (runId: string) => {
      const link = readProjectLink(process.cwd());
      const credentials = readCredentials(process.cwd());
      await abandonChainRun({ server: link.server, apiKey: credentials.apiKey }, runId);
      process.stdout.write(`Chain run ${runId} abandoned.\n`);
    });
}
