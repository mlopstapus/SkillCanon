#!/usr/bin/env node
import { Command } from "commander";
import { registerInitCommand } from "./commands/init.js";
import { registerSyncCommand } from "./commands/sync.js";
import { registerRunCommand } from "./commands/run.js";

/**
 * Defense-in-depth backstop (FR-003): even though credentials.ts/skillcanon-client.ts
 * never construct an error message containing the raw key, this redacts any
 * substring that looks like one before anything reaches stderr.
 */
function redact(message: string): string {
  return message.replace(/\bsk-[A-Za-z0-9_-]{6,}\b/g, "sk-***REDACTED***");
}

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
