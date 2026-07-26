import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import { NotAuthorizedError, type UserSummary } from "../domain/user";
import { insertValidatedUser } from "./insert-validated-user";

type Tx = PostgresJsDatabase<Record<string, never>>;

export interface CreateUserParams {
  teamId: string;
  username: string;
  displayName?: string;
  email: string;
  password: string;
  role?: "admin" | "member";
}

export interface CreateUserOptions {
  auditContext?: AuditContext;
}

/**
 * Creates a user within `actingUser.orgId` only — never a caller-supplied
 * organization (FR-003). Requires an admin caller.
 */
export async function createUser(
  tx: Tx,
  actingUser: UserSummary,
  params: CreateUserParams,
  options: CreateUserOptions = {},
): Promise<{ id: string }> {
  if (actingUser.role !== "admin") {
    throw new NotAuthorizedError();
  }

  const normalized = {
    organizationId: actingUser.orgId,
    teamId: params.teamId,
    username: params.username,
    displayName: params.displayName ?? params.username,
    email: params.email,
    password: params.password,
    role: params.role ?? "member",
  };
  const result = await insertValidatedUser(tx, normalized);
  const auditContext = options.auditContext ?? DEFAULT_WEB_AUDIT_CONTEXT;
  await record(tx, {
    organizationId: actingUser.orgId,
    actorUserId: actingUser.id,
    actorApiKeyId: null,
    action: "user.created",
    resourceType: "user",
    resourceId: result.id,
    before: null,
    after: {
      id: result.id,
      organizationId: actingUser.orgId,
      teamId: normalized.teamId,
      username: normalized.username.toLowerCase(),
      displayName: normalized.displayName,
      email: normalized.email.toLowerCase(),
      role: normalized.role,
      isActive: true,
    },
    transport: auditContext.transport,
    sourceIp: auditContext.sourceIp ?? null,
  });
  return result;
}
