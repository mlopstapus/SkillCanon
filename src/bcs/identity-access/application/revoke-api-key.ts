import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import { withAudit } from "@/shared/db";
import { ApiKeyNotFoundError } from "../domain/api-key";
import { NotAuthorizedError, type UserSummary } from "../domain/user";
import { findByOrgAndId, markRevoked } from "../infrastructure/api-keys-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Deactivates a key (FR-009). Authorization is self-or-admin: the key's
 * owner, or an org admin acting on a key belonging to a user in their own
 * organization. Revoking an already-inactive key is a no-op — idempotent,
 * matching `revokeInvitation`'s precedent.
 */
export async function revokeApiKey(
  db: Db,
  actingUser: UserSummary,
  keyId: string,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
): Promise<void> {
  const key = await findByOrgAndId(db, actingUser.orgId, keyId);
  if (!key) {
    throw new ApiKeyNotFoundError();
  }
  if (actingUser.id !== key.userId && actingUser.role !== "admin") {
    throw new NotAuthorizedError();
  }
  if (!key.isActive) {
    return;
  }

  await withAudit(
    db,
    (tx) => markRevoked(tx, keyId),
    (tx) =>
      record(tx, {
        organizationId: actingUser.orgId,
        actorUserId: actingUser.id,
        actorApiKeyId: null,
        action: "api_key.revoked",
        resourceType: "api_key",
        resourceId: keyId,
        transport: auditContext.transport,
        sourceIp: auditContext.sourceIp ?? null,
      }),
  );
}
