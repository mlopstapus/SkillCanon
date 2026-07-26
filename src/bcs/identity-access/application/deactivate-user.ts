import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import {
  CrossOrgUserAccessError,
  LastActiveAdminError,
  NotAuthorizedError,
  type UserSummary,
} from "../domain/user";
import {
  countActiveAdmins,
  findByOrgAndId,
  update,
} from "../infrastructure/users-repo";

type Tx = PostgresJsDatabase<Record<string, never>>;

export interface DeactivateUserOptions {
  auditContext?: AuditContext;
}

/**
 * Deactivates a user (admin-only, FR-005), refusing to leave an
 * organization with zero active admins (FR-013).
 */
export async function deactivateUser(
  tx: Tx,
  actingUser: UserSummary,
  targetUserId: string,
  options: DeactivateUserOptions = {},
): Promise<void> {
  if (actingUser.role !== "admin") {
    throw new NotAuthorizedError();
  }

  const target = await findByOrgAndId(tx, actingUser.orgId, targetUserId);
  if (!target) {
    throw new CrossOrgUserAccessError();
  }

  if (target.role === "admin" && target.isActive) {
    const activeAdmins = await countActiveAdmins(tx, actingUser.orgId);
    if (activeAdmins <= 1) {
      throw new LastActiveAdminError();
    }
  }

  await update(tx, targetUserId, { isActive: false });
  const auditContext = options.auditContext ?? DEFAULT_WEB_AUDIT_CONTEXT;
  await record(tx, {
    organizationId: actingUser.orgId,
    actorUserId: actingUser.id,
    actorApiKeyId: null,
    action: "user.updated",
    resourceType: "user",
    resourceId: targetUserId,
    before: target,
    after: { ...target, isActive: false },
    transport: auditContext.transport,
    sourceIp: auditContext.sourceIp ?? null,
  });
}
