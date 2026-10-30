import type { Command } from "commander";
import { readProjectLink } from "../config/project-link.js";
import { readCredentials } from "../config/credentials.js";
import { getEvalRun, submitEvalRun, type EvalRun } from "../http/skillcanon-client.js";

export interface EvalRunOptions {
  models: string;
  judge?: string;
  wait?: boolean;
  /** Poll interval, ms (tests shorten it). */
  pollMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function formatEvalRun(run: EvalRun): string {
  const lines = [`Run ${run.id}: ${run.status}${run.error ? ` (${run.error})` : ""}`];
  for (const r of run.results) {
    const verdict = r.error ? `error: ${r.error}` : `${r.passed ? "pass" : "fail"}${r.scorePct === null ? "" : ` ${r.scorePct}%`}`;
    lines.push(`  ${r.model}  ${r.caseId}  ${verdict}`);
  }
  return lines.join("\n");
}

/** True when the run finished and every case passed. */
export const evalPassed = (run: EvalRun) => run.status === "succeeded" && run.results.every((r) => r.passed);

/**
 * Submits a central eval run and optionally waits for it. The CLI only submits and reads (PDR-020):
 * the server's worker runs the models. Returns the final run; the caller sets the exit code.
 */
export async function runEval(repoRoot: string, skill: string, version: string, options: EvalRunOptions): Promise<EvalRun> {
  const models = options.models.split(",").map((m) => m.trim()).filter(Boolean);
  if (models.length === 0) throw new Error("Give at least one model with --models, e.g. --models anthropic/claude-sonnet-5-5.");
  const client = { server: readProjectLink(repoRoot).server, apiKey: readCredentials(repoRoot).apiKey };
  let run = await submitEvalRun(client, skill, version, { models, ...(options.judge ? { judge: options.judge } : {}) });
  while (options.wait && (run.status === "queued" || run.status === "running")) {
    await sleep(options.pollMs ?? 3000);
    run = await getEvalRun(client, skill, version, run.id);
  }
  return run;
}

export async function showEval(repoRoot: string, skill: string, version: string, runId: string): Promise<EvalRun> {
  const client = { server: readProjectLink(repoRoot).server, apiKey: readCredentials(repoRoot).apiKey };
  return getEvalRun(client, skill, version, runId);
}

export function registerEvalCommand(program: Command): void {
  const evalCmd = program.command("eval").description("Run a skill version's evals on the server and read the results.");
  evalCmd
    .command("run")
    .description("Queue an eval run for a skill version (needs an API key with the evals:run scope).")
    .argument("<skill>", "skill slug")
    .argument("<version>", "version to evaluate")
    .requiredOption("--models <list>", "comma-separated models, e.g. anthropic/claude-sonnet-5-5,openai/gpt-5")
    .option("--judge <model>", "judge model for rubric cases")
    .option("--wait", "wait for the run to finish; exit 1 if any case fails")
    .action(async (skill: string, version: string, opts: EvalRunOptions) => {
      const run = await runEval(process.cwd(), skill, version, opts);
      process.stdout.write(`${formatEvalRun(run)}\n`);
      if (opts.wait && !evalPassed(run)) process.exitCode = 1;
    });
  evalCmd
    .command("show")
    .description("Show a run's status and results.")
    .argument("<skill>")
    .argument("<version>")
    .argument("<runId>")
    .action(async (skill: string, version: string, runId: string) => {
      process.stdout.write(`${formatEvalRun(await showEval(process.cwd(), skill, version, runId))}\n`);
    });
}
