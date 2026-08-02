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
  params: { name: string; userTemplate: string },
) {
  return withTenantContext(testDb.appDb, fixture.organizationId, async (tx) => {
    await createPrompt(tx, fixture.actor, { organizationId: fixture.organizationId, name: params.name });
    return publishVersion(tx, fixture.actor, {
      organizationId: fixture.organizationId,
      promptName: params.name,
      version: "1.0.0",
      userTemplate: params.userTemplate,
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
  // Nunjucks' StrictUndefined environment (expand()'s sandboxed renderer)
  // rejects outputting `null` directly, same as a truly undefined
  // variable — every dependency reference needs a `default(fallback, true)`
  // guard (the boolean makes it treat any falsy value, not just
  // `undefined`, as missing), since a failed dependency's `.output` is
  // `null` by design (FR-008).
  await publishStepSkill(testDb, fixture, { name: `${chainName}-a`, userTemplate: "Step A output." });
  await publishStepSkill(testDb, fixture, {
    name: `${chainName}-b`,
    userTemplate: "Step B, given step1={{ step1.status }}:{{ step1.output | default(\"\", true) }}",
  });
  await publishStepSkill(testDb, fixture, {
    name: `${chainName}-c`,
    userTemplate:
      "Step C, given step1={{ step1.status }}:{{ step1.output | default(\"\", true) }}, step2={{ step2.status }}:{{ step2.output | default(\"\", true) }}",
  });

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
