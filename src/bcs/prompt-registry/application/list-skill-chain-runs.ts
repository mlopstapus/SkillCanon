import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { ChainRunSummary } from "../domain/skill-chain";
import { listByPromptForOrg } from "../infrastructure/skill-chain-runs-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Every run of a chain skill, most-recent-`startedAt`-first. A pure,
 * org-scoped read — no `expand()` call, no state transition, safe for a UI
 * to poll or load repeatedly (FR-013). No further per-caller accessibility
 * filter beyond org-scoping, matching this codebase's precedent for other
 * `list*ForOrganization`/`list*ForSkill`-style reads.
 */
export async function listSkillChainRuns(
  db: Db,
  organizationId: string,
  promptId: string,
): Promise<ChainRunSummary[]> {
  const rows = await listByPromptForOrg(db, organizationId, promptId);
  return rows.map((row) => ({
    id: row.id,
    promptId: row.promptId,
    userId: row.userId,
    status: row.status,
    currentStepIndex: row.currentStepIndex,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
  }));
}
