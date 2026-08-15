import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import { getTeam, getUser, type UserSummary } from "@/bcs/identity-access";
import { withAudit } from "@/shared/db";
import type { PromptSummary } from "../domain/prompt";
import {
  CannotTransferToSameOwnerError,
  CrossOrgTransferError,
  SkillNotFoundForTransferError,
  type OwnerType,
} from "../domain/subscription";
import { findPromptByOrgAndId, updatePrompt } from "../infrastructure/prompts-repo";
import { assertAuthorizedForOwner } from "./authorize-owner-action";

/**
 * Reassigns an existing skill in place. Destination preflight deliberately
 * occurs before authorization so missing and cross-org destinations use the
 * transfer-specific error contract rather than authorization's generic one.
 */
export async function transferSkillOwnership(
  db: PostgresJsDatabase<Record<string, never>>,
  actingUser: UserSummary,
  skillId: string,
  params: { newOwnerType: OwnerType; newOwnerId: string },
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
): Promise<PromptSummary> {
  const source = await findPromptByOrgAndId(db, actingUser.orgId, skillId);
  if (!source) {
    throw new SkillNotFoundForTransferError();
  }

  if (source.ownerType === params.newOwnerType && source.ownerId === params.newOwnerId) {
    throw new CannotTransferToSameOwnerError();
  }

  try {
    if (params.newOwnerType === "team") {
      await getTeam(db, actingUser.orgId, params.newOwnerId);
    } else {
      await getUser(db, params.newOwnerId, actingUser.orgId);
    }
  } catch {
    throw new CrossOrgTransferError();
  }

  if (actingUser.role !== "admin") {
    await assertAuthorizedForOwner(db, actingUser, source.ownerType, source.ownerId);
    await assertAuthorizedForOwner(db, actingUser, params.newOwnerType, params.newOwnerId);
  }

  return withAudit(
    db,
    async (tx) =>
      (await updatePrompt(tx, skillId, {
        ownerType: params.newOwnerType,
        ownerId: params.newOwnerId,
      })) ?? source,
    (tx) =>
      record(tx, {
        organizationId: actingUser.orgId,
        actorUserId: actingUser.id,
        actorApiKeyId: null,
        action: "skill.owner_transferred",
        resourceType: "prompt",
        resourceId: skillId,
        before: { ownerType: source.ownerType, ownerId: source.ownerId },
        after: { ownerType: params.newOwnerType, ownerId: params.newOwnerId },
        transport: auditContext.transport,
        sourceIp: auditContext.sourceIp ?? null,
      }),
  );
}
