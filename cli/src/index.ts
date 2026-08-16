#!/usr/bin/env node
import { Command, CommanderError } from "commander";
import { registerInitCommand } from "./commands/init.js";
import { registerSyncCommand } from "./commands/sync.js";
import { registerRunCommand } from "./commands/run.js";
import { redact } from "./redact.js";
import { getInstalledVersion } from "./version.js";
import { checkForUpdate } from "./update-check.js";

const program = new Command();
program.name("skillcanon").description("Sync a repo's Claude Code skills with a SkillCanon project's governed prompts.");
program.version(getInstalledVersion());
program.exitOverride();

registerInitCommand(program);
registerSyncCommand(program);
registerRunCommand(program);

async function main(): Promise<void> {
  // Kicked off in parallel with the command itself (not awaited yet) so a
  // cache-miss network check overlaps with real work instead of adding
  // upfront latency (039-cli-distribution-publishing research.md D4).
  const updateCheckPromise = checkForUpdate({ currentVersion: getInstalledVersion() }).catch(
    (): { notice: null } => ({ notice: null }),
  );

  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    if (err instanceof CommanderError) {
      // Commander already printed its own output (--version/--help/usage error) and
      // would normally call process.exit() directly — exitOverride() converts that
      // into this throw so the update-check notice below still gets a chance to run.
      process.exitCode = err.exitCode;
    } else {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`${redact(message)}\n`);
      process.exitCode = 1;
    }
  }

  const { notice } = await updateCheckPromise;
  if (notice) {
    process.stderr.write(`\n${notice}\n`);
  }
}

void main();
