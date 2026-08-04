#!/usr/bin/env node
import { Command } from "commander";
import { registerInitCommand } from "./commands/init.js";
import { registerSyncCommand } from "./commands/sync.js";
import { registerRunCommand } from "./commands/run.js";
import { redact } from "./redact.js";

const program = new Command();
program.name("skillcanon").description("Sync a repo's Claude Code skills with a SkillCanon project's governed prompts.");

registerInitCommand(program);
registerSyncCommand(program);
registerRunCommand(program);

async function main(): Promise<void> {
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${redact(message)}\n`);
    process.exitCode = 1;
  }
}

void main();
