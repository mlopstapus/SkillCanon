import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getUser } from "@/bcs/identity-access";
import type { PromptActor } from "../domain/prompt";
import { findByProjectAndUser } from "../infrastructure/project-members-repo";
import { listByProject as listAssignedSkillsByProject } from "../infrastructure/project-skill-assignments-repo";
import { listAccessibleByOwnerAndSubscriptions } from "../infrastructure/prompts-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

export interface ListPromptsOptions {
  /**
   * When given and the caller is a member of this project, the result also
   * includes every skill assigned to that project, regardless of which
   * participating team contributed it (022-project-skill-assignment,
   * FR-012). Silently ignored — not an error — for a caller who is not a
   * member of the project (FR-013); the caller still gets their ordinary
   * accessible set.
   */
  projectId?: string;
}

/**
 * The caller's *accessible* set (020-prompt-sharing, data-model.md): skills
 * they own, skills their own team owns, and skills they (or their team)
 * subscribe to — narrower than `listSkillsByOrganization`'s org-wide
 * *discoverable* set. `PromptActor` carries no team id of its own, so the
 * caller's current `teamId` is resolved via identity-access's exported
 * `getUser` (nullable — an unassigned user contributes no team-owned or
 * team-subscribed skills, per 019-account-team-settings-ui).
 */
export async function listPrompts(db: Db, actor: PromptActor, options: ListPromptsOptions = {}) {
  const user = await getUser(db, actor.userId, actor.organizationId);
  const accessible = await listAccessibleByOwnerAndSubscriptions(
    db,
    actor.organizationId,
    actor.userId,
    user.teamId,
  );

  if (!options.projectId) {
    return accessible;
  }

  const membership = await findByProjectAndUser(db, options.projectId, actor.userId);
  if (!membership) {
    return accessible;
  }

  const assigned = await listAssignedSkillsByProject(db, actor.organizationId, options.projectId);
  const merged = new Map(accessible.map((prompt) => [prompt.id, prompt]));
  for (const prompt of assigned) {
    merged.set(prompt.id, prompt);
  }
  return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
}
