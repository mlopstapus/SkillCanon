import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import {
  CrossOrgTeamAccessError,
  CrossOrgUserAccessError,
  getTeam,
  getUser,
  type UserSummary,
} from "@/bcs/identity-access";
import { withAudit } from "@/shared/db";
import type { PromptSummary } from "../domain/prompt";
import {
  CannotTransferToSameOwnerError,
  CrossOrgTransferError,
  SkillNotFoundForTransferError,
  type OwnerType,
} from "../domain/subscription";
import {
  findPromptByOrgAndId,
  findPromptByOrgAndIdForUpdate,
  updatePrompt,
} from "../infrastructure/prompts-repo";
import { assertAuthorizedForOwner } from "./authorize-owner-action";

/**
 * Reassigns an existing skill in place. A non-admin is authorized against the
 * source before destination lookup, preventing an identity-membership oracle,
 * then re-authorized against the row-locked current source inside the audited
 * transaction so a stale request cannot overwrite an intervening transfer.
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

  if (actingUser.role !== "admin") {
    await assertAuthorizedForOwner(db, actingUser, source.ownerType, source.ownerId);
  }

  try {
    if (params.newOwnerType === "team") {
      await getTeam(db, actingUser.orgId, params.newOwnerId);
    } else {
      await getUser(db, params.newOwnerId, actingUser.orgId);
    }
  } catch (error) {
    if (error instanceof CrossOrgTeamAccessError || error instanceof CrossOrgUserAccessError) {
      throw new CrossOrgTransferError();
    }
    throw error;
  }

  if (actingUser.role !== "admin") {
    await assertAuthorizedForOwner(db, actingUser, params.newOwnerType, params.newOwnerId);
  }

  let lockedSource: PromptSummary;

  return withAudit(
    db,
    async (tx) => {
      const currentSource = await findPromptByOrgAndIdForUpdate(
        tx,
        actingUser.orgId,
        skillId,
      );
      if (!currentSource) {
        throw new SkillNotFoundForTransferError();
      }

      if (actingUser.role !== "admin") {
        await assertAuthorizedForOwner(
          tx,
          actingUser,
          currentSource.ownerType,
          currentSource.ownerId,
        );
      }

      if (
        currentSource.ownerType === params.newOwnerType &&
        currentSource.ownerId === params.newOwnerId
      ) {
        throw new CannotTransferToSameOwnerError();
      }

      lockedSource = currentSource;
      const updated = await updatePrompt(tx, skillId, {
        ownerType: params.newOwnerType,
        ownerId: params.newOwnerId,
      });
      if (!updated) {
        throw new SkillNotFoundForTransferError();
      }
      return updated;
    },
    (tx) =>
      record(tx, {
        organizationId: actingUser.orgId,
        actorUserId: actingUser.id,
        actorApiKeyId: null,
        action: "skill.owner_transferred",
        resourceType: "prompt",
        resourceId: skillId,
        before: {
          ownerType: lockedSource.ownerType,
          ownerId: lockedSource.ownerId,
        },
        after: { ownerType: params.newOwnerType, ownerId: params.newOwnerId },
        transport: auditContext.transport,
        sourceIp: auditContext.sourceIp ?? null,
      }),
  );
}
