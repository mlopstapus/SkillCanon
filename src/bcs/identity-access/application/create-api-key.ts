import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import { withAudit } from "@/shared/db";
import {
  InvalidScopeError,
  NoScopesSelectedError,
  ScopeExceedsPermissionsError,
  isScopeAllowedForRole,
  isValidScopeShape,
} from "../domain/api-key";
import type { UserSummary } from "../domain/user";
import { insert as insertApiKey } from "../infrastructure/api-keys-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

export interface CreateApiKeyParams {
  name: string;
  scopes: string[];
  expiresAt?: Date;
}

function generateRawKey(): string {
  return "sk_" + randomBytes(32).toString("base64url");
}

function hashKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

/**
 * Creates a scoped API key for `actingUser` (FR-001). Every requested scope
 * must be well-formed (`InvalidScopeError`) and within `actingUser.role`'s
 * permission cap (`ScopeExceedsPermissionsError`, research.md §2) — checked
 * before any write. The raw key is generated here and returned exactly
 * once; only its SHA-256 hash and a display prefix are persisted
 * (research.md §3).
 */
export async function createApiKey(
  db: Db,
  actingUser: UserSummary,
  params: CreateApiKeyParams,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
): Promise<{ id: string; rawKey: string }> {
  if (params.scopes.length === 0) {
    throw new NoScopesSelectedError();
  }
  for (const scope of params.scopes) {
    if (!isValidScopeShape(scope)) {
      throw new InvalidScopeError(scope);
    }
  }
  for (const scope of params.scopes) {
    if (!isScopeAllowedForRole(scope, actingUser.role)) {
      throw new ScopeExceedsPermissionsError(scope);
    }
  }

  const rawKey = generateRawKey();
  const keyHash = hashKey(rawKey);
  const prefix = rawKey.slice(0, 12);
  // Generated client-side so the audit event (below) can reference the
  // row's id within the same transaction, matching withAudit's established
  // pattern (CLAUDE.md).
  const id = randomUUID();

  await withAudit(
    db,
    (tx) =>
      insertApiKey(tx, {
        id,
        organizationId: actingUser.orgId,
        userId: actingUser.id,
        name: params.name,
        keyHash,
        prefix,
        scopes: params.scopes,
        expiresAt: params.expiresAt ?? null,
      }),
    (tx) =>
      record(tx, {
        organizationId: actingUser.orgId,
        actorUserId: actingUser.id,
        actorApiKeyId: null,
        action: "api_key.created",
        resourceType: "api_key",
        resourceId: id,
        transport: auditContext.transport,
        sourceIp: auditContext.sourceIp ?? null,
      }),
  );

  return { id, rawKey };
}
