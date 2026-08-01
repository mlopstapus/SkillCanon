import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import { withAudit } from "@/shared/db";
import {
  PromptNotFoundError,
  PromptVersionNotFoundError,
  type PromptActor,
} from "../domain/prompt";
import { findPromptByOrgAndName, updatePrompt } from "../infrastructure/prompts-repo";
import { findVersionByPromptAndLabel } from "../infrastructure/prompt-versions-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Rolls back a prompt's active version to a previously-published version by
 * repointing `active_version_id`. The target version row is never modified.
 */
export async function rollbackPrompt(
  db: Db,
  actor: PromptActor,
  promptName: string,
  targetVersion: string,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
) {
  const prompt = await findPromptByOrgAndName(db, actor.organizationId, promptName);
  if (!prompt) {
    throw new PromptNotFoundError(promptName);
  }

  const version = await findVersionByPromptAndLabel(db, prompt.id, targetVersion);
  if (!version) {
    throw new PromptVersionNotFoundError(targetVersion);
  }

  return withAudit(
    db,
    async (tx) => {
      const updated = await updatePrompt(tx, prompt.id, { activeVersionId: version.id });
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
        action: "prompt.version_activated",
        resourceType: "prompt",
        resourceId: prompt.id,
        before: { activeVersionId: prompt.activeVersionId },
        after: { activeVersionId: version.id },
        transport: auditContext.transport,
        sourceIp: auditContext.sourceIp ?? null,
      }),
  );
}
