import { randomUUID } from "node:crypto";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import { withAudit } from "@/shared/db";
import { isUniqueViolation } from "@/shared/db/postgres-errors";
import {
  DuplicatePromptNameError,
  type CreatePromptParams,
  type PromptActor,
} from "../domain/prompt";
import { findPromptByOrgAndName, insertPrompt } from "../infrastructure/prompts-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * A skill's owner is always the creating user (PDR-016) — there is no
 * "create as team-owned" path; a skill only becomes team-owned via
 * subscribeSkill/forkSkill (future work).
 */
export async function createPrompt(
  db: Db,
  actor: PromptActor,
  params: CreatePromptParams,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
) {
  // Check for duplicate name within the org before attempting insert.
  if (await findPromptByOrgAndName(db, params.organizationId, params.name)) {
    throw new DuplicatePromptNameError(params.name);
  }

  const id = randomUUID();
  const values = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description ?? null,
    isDeprecated: false,
    activeVersionId: null,
    ownerType: "user" as const,
    ownerId: actor.userId,
    forkedFromSkillId: null,
  };

  try {
    return await withAudit(
      db,
      (tx) => insertPrompt(tx, values),
      (tx) =>
        record(tx, {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          actorApiKeyId: null,
          action: "prompt.created",
          resourceType: "prompt",
          resourceId: id,
          before: null,
          after: values,
          transport: auditContext.transport,
          sourceIp: auditContext.sourceIp ?? null,
        }),
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new DuplicatePromptNameError(params.name);
    }
    throw err;
  }
}
