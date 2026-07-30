import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getUser } from "@/bcs/identity-access";
import type { PromptActor } from "../domain/prompt";
import { listAccessibleByOwnerAndSubscriptions } from "../infrastructure/prompts-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * The caller's *accessible* set (020-prompt-sharing, data-model.md): skills
 * they own, skills their own team owns, and skills they (or their team)
 * subscribe to — narrower than `listSkillsByOrganization`'s org-wide
 * *discoverable* set. `PromptActor` carries no team id of its own, so the
 * caller's current `teamId` is resolved via identity-access's exported
 * `getUser` (nullable — an unassigned user contributes no team-owned or
 * team-subscribed skills, per 019-account-team-settings-ui).
 */
export async function listPrompts(db: Db, actor: PromptActor) {
  const user = await getUser(db, actor.userId, actor.organizationId);
  return listAccessibleByOwnerAndSubscriptions(db, actor.organizationId, actor.userId, user.teamId);
}
