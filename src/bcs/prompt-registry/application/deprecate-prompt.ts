import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import { withAudit } from "@/shared/db";
import { PromptNotFoundError, type PromptActor } from "../domain/prompt";
import { findPromptByOrgAndName, updatePrompt } from "../infrastructure/prompts-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

export async function deprecatePrompt(
  db: Db,
  actor: PromptActor,
  promptName: string,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
) {
  const prompt = await findPromptByOrgAndName(db, actor.organizationId, promptName);
  if (!prompt) {
    throw new PromptNotFoundError(promptName);
  }

  return withAudit(
    db,
    async (tx) => {
      const updated = await updatePrompt(tx, prompt.id, { isDeprecated: true });
      if (!updated) {
        throw new PromptNotFoundError(promptName);
      }
      return updated;
    },
    (tx) =>
      record(tx, {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        actorApiKeyId: null,
        action: "prompt.deprecated",
        resourceType: "prompt",
        resourceId: prompt.id,
        before: prompt,
        after: { ...prompt, isDeprecated: true },
        transport: auditContext.transport,
        sourceIp: auditContext.sourceIp ?? null,
      }),
  );
}
