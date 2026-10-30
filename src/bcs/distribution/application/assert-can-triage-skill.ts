import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getTeam, NotAuthorizedError } from "@/bcs/identity-access";
import type { PromptSummary } from "@/bcs/prompt-registry";

export interface FeedbackTriager {
  organizationId: string;
  userId: string;
  role: "admin" | "member";
}

/**
 * Owner, owning team's owner, or org admin may triage a skill's feedback
 * (mark addressed, draft improvements). Re-derived locally: prompt-registry's
 * owner check is not exported (same two-line rule).
 */
export async function assertCanTriageSkill(
  db: PostgresJsDatabase<Record<string, never>>,
  actor: FeedbackTriager,
  prompt: Pick<PromptSummary, "ownerType" | "ownerId">,
): Promise<void> {
  const isOwner =
    actor.role === "admin" ||
    (prompt.ownerType === "user" && prompt.ownerId === actor.userId) ||
    (prompt.ownerType === "team" && (await getTeam(db, actor.organizationId, prompt.ownerId)).ownerId === actor.userId);
  if (!isOwner) throw new NotAuthorizedError();
}
