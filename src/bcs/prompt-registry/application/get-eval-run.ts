import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { EvalRunNotFoundError } from "../domain/eval-run";
import { normalizeVersionLabel, PromptNotFoundError, PromptVersionNotFoundError, type PromptActor } from "../domain/prompt";
import { findRunByOrgAndId, listResultsByRun, listRunsByVersion } from "../infrastructure/eval-runs-repo";
import { findPromptByOrgAndName } from "../infrastructure/prompts-repo";
import { findVersionByPromptAndLabel } from "../infrastructure/prompt-versions-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

/** A run and its results. A run of another org or another skill version is indistinguishable from not found. */
export async function getEvalRun(db: Db, actor: PromptActor, promptName: string, version: string, runId: string) {
  const versionId = await resolveVersionId(db, actor, promptName, version);
  const run = await findRunByOrgAndId(db, actor.organizationId, runId);
  if (!run || run.promptVersionId !== versionId) throw new EvalRunNotFoundError();
  const results = await listResultsByRun(db, actor.organizationId, runId);
  return { ...run, results };
}

export async function listEvalRuns(db: Db, actor: PromptActor, promptName: string, version: string) {
  const versionId = await resolveVersionId(db, actor, promptName, version);
  return listRunsByVersion(db, actor.organizationId, versionId);
}

async function resolveVersionId(db: Db, actor: PromptActor, promptName: string, version: string) {
  const prompt = await findPromptByOrgAndName(db, actor.organizationId, promptName);
  if (!prompt) throw new PromptNotFoundError(promptName);
  const found = await findVersionByPromptAndLabel(db, prompt.id, normalizeVersionLabel(version));
  if (!found) throw new PromptVersionNotFoundError(version);
  return found.id;
}
