import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  normalizeChainRunPagination,
  type ChainRunPage,
  type ChainRunPaginationOptions,
} from "../domain/skill-chain";
import { countByPromptForOrg, listByPromptForOrg } from "../infrastructure/skill-chain-runs-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * One page of runs of a chain skill, most-recent-`startedAt`-first. A pure,
 * org-scoped read — no `expand()` call, no state transition, safe for a UI
 * to poll or load repeatedly (FR-013). No further per-caller accessibility
 * filter beyond org-scoping, matching this codebase's precedent for other
 * `list*ForOrganization`/`list*ForSkill`-style reads. Paginated
 * (027-skill-chain-views-ui) — mirrors `audit-compliance`'s
 * `listAuditEvents` page/pageSize/total shape.
 */
export async function listSkillChainRuns(
  db: Db,
  organizationId: string,
  promptId: string,
  options: ChainRunPaginationOptions = {},
): Promise<ChainRunPage> {
  const { page, pageSize, limit, offset } = normalizeChainRunPagination(options);
  const [rows, total] = await Promise.all([
    listByPromptForOrg(db, organizationId, promptId, limit, offset),
    countByPromptForOrg(db, organizationId, promptId),
  ]);
  return {
    items: rows.map((row) => ({
      id: row.id,
      promptId: row.promptId,
      version: row.version,
      userId: row.userId,
      status: row.status,
      currentStepIndex: row.currentStepIndex,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
    })),
    page,
    pageSize,
    total,
  };
}
