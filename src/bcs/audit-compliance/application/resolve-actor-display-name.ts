import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getApiKeySummary, listUsers } from "@/bcs/identity-access";

type Db = PostgresJsDatabase<Record<string, never>>;

export interface ResolvedActor {
  kind: "user" | "api_key" | "system";
  id: string | null;
  displayName: string;
  subtitle: string;
}

/**
 * Resolves a display name/subtitle for an audit event's actor. `actorUserId`
 * and `actorApiKeyId` are mutually exclusive on `AuditEvent`; both null
 * means the event was recorded by the system itself (e.g. a scheduled
 * retention prune).
 */
export async function resolveActorDisplayName(
  db: Db,
  organizationId: string,
  requestingUserId: string,
  actorUserId: string | null,
  actorApiKeyId: string | null,
): Promise<ResolvedActor> {
  if (actorUserId) {
    try {
      const users = await listUsers(db, {
        id: requestingUserId,
        orgId: organizationId,
        teamId: null,
        role: "member",
        email: "",
      });
      const user = users.find((u) => u.id === actorUserId);
      if (user) {
        return {
          kind: "user",
          id: actorUserId,
          displayName: user.displayName,
          subtitle: user.role === "admin" ? "admin" : "member",
        };
      }
    } catch {
      // fall through to the unresolved-user fallback below
    }
    return { kind: "user", id: actorUserId, displayName: actorUserId, subtitle: "unknown actor" };
  }

  if (actorApiKeyId) {
    try {
      const apiKey = await getApiKeySummary(db, organizationId, actorApiKeyId);
      if (apiKey) {
        return { kind: "api_key", id: actorApiKeyId, displayName: apiKey.name, subtitle: "API key" };
      }
    } catch {
      // fall through to the unresolved-key fallback below
    }
    return { kind: "api_key", id: actorApiKeyId, displayName: actorApiKeyId, subtitle: "API key" };
  }

  return { kind: "system", id: null, displayName: "system", subtitle: "scheduled" };
}
