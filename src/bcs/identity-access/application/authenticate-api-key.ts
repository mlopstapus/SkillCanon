import { createHash } from "node:crypto";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { UserSummary } from "../domain/user";
import { findByHash, updateLastUsedAt } from "../infrastructure/api-keys-repo";
import { findById as findUserById } from "../infrastructure/users-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

function hashKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

/**
 * Resolves `rawKey` to its owning user, organization, and scopes (FR-006).
 * Never throws — any unrecognized, malformed, expired, or revoked key (or
 * one whose owning user no longer exists, is deactivated, or has been
 * unassigned from every team (019-account-team-settings-ui), research.md
 * §4) resolves to `null`. Only a successful resolution updates
 * `last_used_at` (FR-007).
 */
export async function authenticateApiKey(
  db: Db,
  rawKey: string,
): Promise<{ user: UserSummary; scopes: string[] } | null> {
  const keyHash = hashKey(rawKey);
  const key = await findByHash(db, keyHash);
  if (!key || !key.isActive) {
    return null;
  }
  if (key.expiresAt && key.expiresAt <= new Date()) {
    return null;
  }

  const owner = await findUserById(db, key.userId);
  if (!owner || !owner.isActive || owner.teamId === null) {
    return null;
  }

  await updateLastUsedAt(db, key.id);

  const user: UserSummary = {
    id: owner.id,
    orgId: owner.organizationId,
    teamId: owner.teamId,
    role: owner.role,
    email: owner.email,
  };
  return { user, scopes: key.scopes };
}
