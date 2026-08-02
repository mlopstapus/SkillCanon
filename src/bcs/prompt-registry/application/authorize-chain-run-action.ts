import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getUser } from "@/bcs/identity-access";
import { PromptNotFoundError, type PromptActor, type PromptSummary } from "../domain/prompt";
import { listProjectIdsForUser } from "../infrastructure/project-members-repo";
import { listAccessibleByOwnerAndSubscriptions } from "../infrastructure/prompts-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Authorization for starting/advancing/abandoning a chain run
 * (026-skill-chains, spec Clarifications): the caller must already be in
 * the same accessible-skill set `listPrompts` computes (owner, own team,
 * direct subscription, or membership in a project that subscribes) — no
 * new, chain-specific authorization concept. Scoped narrower than
 * `listPrompts`'s optional `projectId` widening (project *assignment*),
 * since chain-run functions take no `projectId` parameter (research.md).
 *
 * On denial, throws the same `PromptNotFoundError` a nonexistent skill
 * would produce — never a distinguishing "found but not authorized" error,
 * matching this codebase's established cross-org/no-access-looks-like-
 * not-found convention.
 */
export async function assertSkillAccessible(
  db: Db,
  actor: PromptActor,
  prompt: Pick<PromptSummary, "id" | "name">,
): Promise<void> {
  const [user, userProjectIds] = await Promise.all([
    getUser(db, actor.userId, actor.organizationId),
    listProjectIdsForUser(db, actor.userId),
  ]);
  const accessible = await listAccessibleByOwnerAndSubscriptions(
    db,
    actor.organizationId,
    actor.userId,
    user.teamId,
    userProjectIds,
  );

  if (!accessible.some((p) => p.id === prompt.id)) {
    throw new PromptNotFoundError(prompt.name);
  }
}
