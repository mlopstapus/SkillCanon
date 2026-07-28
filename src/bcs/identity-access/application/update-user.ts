import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import { isUniqueViolation } from "@/shared/db";
import {
  CrossOrgUserAccessError,
  DuplicateUserError,
  InvalidTeamAssignmentError,
  NotAuthorizedError,
  type UserSummary,
} from "../domain/user";
import { findById as findTeamById } from "../infrastructure/teams-repo";
import {
  findByOrgAndId,
  update,
  type UpdateUserFields,
} from "../infrastructure/users-repo";

type Tx = PostgresJsDatabase<Record<string, never>>;

const SELF_EDITABLE_FIELDS = new Set<keyof UpdateUserFields>(["displayName"]);

export interface UpdateUserOptions {
  auditContext?: AuditContext;
}

/**
 * Updates a user's fields, scoped to `actingUser.orgId` (FR-004).
 */
export async function updateUser(
  tx: Tx,
  actingUser: UserSummary,
  targetUserId: string,
  fields: UpdateUserFields,
  options: UpdateUserOptions = {},
): Promise<void> {
  const target = await findByOrgAndId(tx, actingUser.orgId, targetUserId);
  if (!target) {
    throw new CrossOrgUserAccessError();
  }

  const isSelf = actingUser.id === targetUserId;
  const isAdmin = actingUser.role === "admin";

  if (!isAdmin) {
    if (!isSelf) {
      throw new NotAuthorizedError();
    }
    const requestedFields = Object.keys(fields) as (keyof UpdateUserFields)[];
    const onlySelfEditableFields = requestedFields.every((field) =>
      SELF_EDITABLE_FIELDS.has(field),
    );
    if (!onlySelfEditableFields) {
      throw new NotAuthorizedError();
    }
  }

  if (fields.teamId !== undefined && fields.teamId !== null) {
    const team = await findTeamById(tx, fields.teamId);
    if (!team || team.organizationId !== actingUser.orgId) {
      throw new InvalidTeamAssignmentError();
    }
  }

  const normalizedFields: UpdateUserFields = { ...fields };
  if (normalizedFields.email !== undefined) {
    normalizedFields.email = normalizedFields.email.toLowerCase();
  }
  if (normalizedFields.username !== undefined) {
    normalizedFields.username = normalizedFields.username.toLowerCase();
  }

  try {
    await update(tx, targetUserId, normalizedFields);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new DuplicateUserError(
        normalizedFields.email !== undefined ? "email" : "username",
      );
    }
    throw err;
  }

  const auditContext = options.auditContext ?? DEFAULT_WEB_AUDIT_CONTEXT;
  await record(tx, {
    organizationId: actingUser.orgId,
    actorUserId: actingUser.id,
    actorApiKeyId: null,
    action: "user.updated",
    resourceType: "user",
    resourceId: targetUserId,
    before: target,
    after: { ...target, ...normalizedFields },
    transport: auditContext.transport,
    sourceIp: auditContext.sourceIp ?? null,
  });
}
