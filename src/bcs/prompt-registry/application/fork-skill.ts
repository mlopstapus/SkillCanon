import { randomUUID } from "node:crypto";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import type { UserSummary } from "@/bcs/identity-access";
import { withAudit } from "@/shared/db";
import { isUniqueViolation } from "@/shared/db/postgres-errors";
import { DuplicatePromptNameError } from "../domain/prompt";
import { CannotForkOwnSkillError, SourceSkillNotFoundError, type ForkSkillParams } from "../domain/subscription";
import { findPromptByOrgAndId, findPromptByOrgAndName, insertPrompt } from "../infrastructure/prompts-repo";
import { assertAuthorizedForOwner } from "./authorize-owner-action";

type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Creates a new, independent skill shell stamped with a permanent
 * `forkedFromSkillId` lineage pointer back to the source. Content (the
 * fork's own first version) is authored separately afterward through the
 * normal publishVersion path — exactly like a blank-created skill
 * (032-skill-file-format-refactor's FR-018) — never copied automatically
 * here. Superseded 020-prompt-sharing's original "copy the source's
 * current active version verbatim" behavior per the 2026-08-15 design doc:
 * a caller-editable copy needs an editable name up front and editable
 * content afterward, not an instant unrenamable duplicate.
 */
export async function forkSkill(
  db: Db,
  actingUser: UserSummary,
  sourceSkillId: string,
  params: ForkSkillParams,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
) {
  const source = await findPromptByOrgAndId(db, actingUser.orgId, sourceSkillId);
  if (!source) {
    throw new SourceSkillNotFoundError();
  }

  if (source.ownerType === params.ownerType && source.ownerId === params.ownerId) {
    throw new CannotForkOwnSkillError();
  }

  await assertAuthorizedForOwner(db, actingUser, params.ownerType, params.ownerId);

  if (await findPromptByOrgAndName(db, actingUser.orgId, params.name)) {
    throw new DuplicatePromptNameError(params.name);
  }

  const newPromptId = randomUUID();
  const promptValues = {
    id: newPromptId,
    organizationId: actingUser.orgId,
    name: params.name,
    description: params.description ?? null,
    isDeprecated: false,
    activeVersionId: null,
    ownerType: params.ownerType,
    ownerId: params.ownerId,
    forkedFromSkillId: sourceSkillId,
  };

  try {
    return await withAudit(
      db,
      (tx) => insertPrompt(tx, promptValues),
      (tx) =>
        record(tx, {
          organizationId: actingUser.orgId,
          actorUserId: actingUser.id,
          actorApiKeyId: null,
          action: "skill.forked",
          resourceType: "prompt",
          resourceId: newPromptId,
          before: null,
          after: promptValues,
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
