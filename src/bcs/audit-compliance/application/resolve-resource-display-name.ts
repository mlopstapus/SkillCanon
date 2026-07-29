import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  getApiKeySummary,
  getInvitation,
  getOrganization,
  getTeam,
  listUsers,
} from "@/bcs/identity-access";
import { getObjective, getPolicy } from "@/bcs/governance";
import { getProject, getPromptById, getPromptVersion } from "@/bcs/prompt-registry";

type Db = PostgresJsDatabase<Record<string, never>>;

export interface ResolvedResourceName {
  name: string;
  resolved: boolean;
}

/**
 * Resolves a human-readable display name for an audit event's resource,
 * live, at read time — `AuditEvent` itself stores only `resourceType` +
 * `resourceId` (020-audit-log-ui's Clarifications chose live resolution
 * over denormalizing a stored name). Falls back to the raw `resourceId`
 * whenever no resolver exists for the type, the resource has since been
 * deleted, or its owning bounded context can't resolve it — this fallback
 * is expected, correct behavior, not an error condition.
 */
export async function resolveResourceDisplayName(
  db: Db,
  organizationId: string,
  requestingUserId: string,
  resourceType: string,
  resourceId: string | null,
): Promise<ResolvedResourceName> {
  const fallback = (): ResolvedResourceName => ({ name: resourceId ?? "—", resolved: false });

  if (!resourceId) {
    return fallback();
  }

  try {
    switch (resourceType) {
      case "team": {
        const team = await getTeam(db, organizationId, resourceId).catch(() => null);
        return team ? { name: team.name, resolved: true } : fallback();
      }
      case "organization": {
        const org = await getOrganization(db, resourceId).catch(() => null);
        return org && org.id === organizationId ? { name: org.name, resolved: true } : fallback();
      }
      case "user": {
        // `getUser` deliberately never returns `displayName` (identity-access's
        // own contract) — `listUsers` is the established way this codebase
        // already resolves a display name from a bare user id (mirrors
        // `list.ts`'s `resolveActorUserIdsByDisplayName`).
        const users = await listUsers(db, {
          id: requestingUserId,
          orgId: organizationId,
          teamId: null,
          role: "member",
          email: "",
        });
        const user = users.find((u) => u.id === resourceId);
        return user ? { name: user.displayName, resolved: true } : fallback();
      }
      case "policy": {
        const policy = await getPolicy(db, { organizationId, userId: requestingUserId }, resourceId);
        return policy ? { name: policy.name, resolved: true } : fallback();
      }
      case "objective": {
        const objective = await getObjective(
          db,
          { organizationId, userId: requestingUserId },
          resourceId,
        );
        return objective ? { name: objective.title, resolved: true } : fallback();
      }
      case "project": {
        const project = await getProject(db, organizationId, resourceId);
        return project ? { name: project.name, resolved: true } : fallback();
      }
      case "invitation": {
        const invitation = await getInvitation(db, organizationId, resourceId);
        return invitation ? { name: invitation.email, resolved: true } : fallback();
      }
      case "api_key": {
        const apiKey = await getApiKeySummary(db, organizationId, resourceId);
        return apiKey ? { name: apiKey.name, resolved: true } : fallback();
      }
      case "prompt": {
        const prompt = await getPromptById(db, organizationId, resourceId);
        return prompt ? { name: prompt.name, resolved: true } : fallback();
      }
      case "prompt_version": {
        const version = await getPromptVersion(db, organizationId, resourceId);
        return version ? { name: version.version, resolved: true } : fallback();
      }
      default:
        // "project_member" (no id-based finder — a join-row with no natural
        // single "name") and any future/unrecognized resourceType.
        return fallback();
    }
  } catch {
    return fallback();
  }
}
