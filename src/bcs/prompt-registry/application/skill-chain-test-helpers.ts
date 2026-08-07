import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { withTenantContext } from "@/shared/db/tenant-context";
import type { TestDb } from "@/shared/db/test-helpers";
import type { ChainStep } from "../domain/skill-chain";
import { createPrompt } from "./create-prompt";
import { makePromptFixtureOrg, type PromptFixtureOrg } from "./prompt-test-helpers";
import { publishVersion } from "./publish-version";

export type ChainFixtureOrg = PromptFixtureOrg;

export async function makeChainFixtureOrg(testDb: TestDb): Promise<ChainFixtureOrg> {
  return makePromptFixtureOrg(testDb);
}

/** Creates + publishes a plain template skill for use as a chain step target. */
export async function publishStepSkill(
  testDb: TestDb,
  fixture: ChainFixtureOrg,
  params: { name: string; content: string },
) {
  return withTenantContext(testDb.appDb, fixture.organizationId, async (tx) => {
    await createPrompt(tx, fixture.actor, { organizationId: fixture.organizationId, name: params.name });
    return publishVersion(tx, fixture.actor, {
      organizationId: fixture.organizationId,
      promptName: params.name,
      version: "1.0.0",
      mainFile: { content: params.content },
    });
  });
}

/** Creates + publishes a chain version referencing already-published step skills. */
export async function publishChain(
  testDb: TestDb,
  fixture: ChainFixtureOrg,
  params: { name: string; steps: ChainStep[]; version?: string },
) {
  return withTenantContext(testDb.appDb, fixture.organizationId, async (tx) => {
    await createPrompt(tx, fixture.actor, { organizationId: fixture.organizationId, name: params.name });
    return publishVersion(tx, fixture.actor, {
      organizationId: fixture.organizationId,
      promptName: params.name,
      version: params.version ?? "1.0.0",
      steps: params.steps,
    });
  });
}

/**
 * A standard 3-step chain: step1 has no dependencies (its template
 * references no chain-input variable, since step 0 always resolves with an
 * empty `input`); step2 depends on step1; step3 depends on both step1 and
 * step2 — matching `quickstart.md`'s shape, covering both a direct
 * predecessor dependency and a non-adjacent one in the same chain.
 */
export async function publishThreeStepChain(
  testDb: TestDb,
  fixture: ChainFixtureOrg,
  chainName: string = `chain-${randomUUID()}`,
) {
  // A step is invoked exactly like any other expand() call — no dependency
  // data is auto-substituted into its content (032-skill-file-format-refactor:
  // expand() has no `input` parameter for any caller, including chain
  // steps). Each prior step's caller-reported output stays visible to the
  // *caller* via the run's step list; relaying it into a later step is the
  // caller's own responsibility, so these fixtures use plain static content.
  await publishStepSkill(testDb, fixture, { name: `${chainName}-a`, content: "Step A output." });
  await publishStepSkill(testDb, fixture, { name: `${chainName}-b`, content: "Step B content." });
  await publishStepSkill(testDb, fixture, { name: `${chainName}-c`, content: "Step C content." });

  const steps: ChainStep[] = [
    { id: "step1", promptName: `${chainName}-a`, dependsOn: [] },
    { id: "step2", promptName: `${chainName}-b`, dependsOn: ["step1"] },
    { id: "step3", promptName: `${chainName}-c`, dependsOn: ["step1", "step2"] },
  ];
  const version = await publishChain(testDb, fixture, { name: chainName, steps });
  return { promptName: chainName, version, steps };
}

export async function queryChainRunRows(
  testDb: TestDb,
  whereSql: ReturnType<typeof sql>,
): Promise<Array<Record<string, unknown>>> {
  const rows = await testDb.ownerDb.execute<Record<string, unknown>>(
    sql`select * from prompt_registry.skill_chain_runs where ${whereSql}`,
  );
  return Array.from(rows);
}

export async function queryChainRunStepRows(
  testDb: TestDb,
  whereSql: ReturnType<typeof sql>,
): Promise<Array<Record<string, unknown>>> {
  const rows = await testDb.ownerDb.execute<Record<string, unknown>>(
    sql`select * from prompt_registry.skill_chain_run_steps where ${whereSql}`,
  );
  return Array.from(rows);
}
