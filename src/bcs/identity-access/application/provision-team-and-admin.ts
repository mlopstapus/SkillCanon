import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import type { ProvisionTeamAndAdmin } from "./bootstrap-organization";
import { createTeam } from "./create-team";
import { insertValidatedUser } from "./insert-validated-user";
import { update as updateTeam } from "../infrastructure/teams-repo";

type Tx = PostgresJsDatabase<Record<string, never>>;

export interface ProvisionTeamAndAdminParams {
  team: { name: string; slug: string };
  admin: {
    username: string;
    displayName?: string;
    email: string;
    password: string;
  };
}

/**
 * The real `provisionTeamAndAdmin` callback (FR-010), replacing
 * `bootstrapOrganization`'s test-only stub.
 */
export function makeProvisionTeamAndAdmin(
  params: ProvisionTeamAndAdminParams,
): ProvisionTeamAndAdmin {
  return async (tx: Tx, organizationId: string, auditContext?: AuditContext) => {
    const context = auditContext ?? DEFAULT_WEB_AUDIT_CONTEXT;
    const { id: teamId } = await createTeam(
      tx,
      {
        organizationId,
        name: params.team.name,
        slug: params.team.slug,
      },
      { auditContext: context },
    );

    const { id: userId } = await insertValidatedUser(tx, {
      organizationId,
      teamId,
      username: params.admin.username,
      displayName: params.admin.displayName ?? params.admin.username,
      email: params.admin.email,
      password: params.admin.password,
      role: "admin",
    });

    await record(tx, {
      organizationId,
      actorUserId: null,
      actorApiKeyId: null,
      action: "user.created",
      resourceType: "user",
      resourceId: userId,
      before: null,
      after: {
        id: userId,
        organizationId,
        teamId,
        username: params.admin.username.toLowerCase(),
        displayName: params.admin.displayName ?? params.admin.username,
        email: params.admin.email.toLowerCase(),
        role: "admin",
        isActive: true,
      },
      transport: context.transport,
      sourceIp: context.sourceIp ?? null,
    });

    await updateTeam(tx, teamId, { ownerId: userId });

    return { teamId, userId };
  };
}
