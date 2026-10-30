import { randomUUID } from "node:crypto";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { record, DEFAULT_WEB_AUDIT_CONTEXT, type AuditContext } from "@/bcs/audit-compliance";
import { isUniqueViolation, withAudit } from "@/shared/db";
import {
  InstallationNotActiveError,
  InvalidInstallStateError,
  InstallationOwnedByAnotherOrganizationError,
  signInstallState,
  verifyInstallState,
  type Installation,
} from "../domain/installation";
import {
  fetchInstallationAccount,
  mintInstallationToken,
  type GithubAppConfig,
} from "../infrastructure/github-app";
import {
  findByGithubInstallationId,
  findByOrgAndId,
  insertInstallation,
  listActiveByOrg,
} from "../infrastructure/installations-repo";

type Db = PostgresJsDatabase<Record<string, never>>;
type Actor = { organizationId: string; userId: string };

/** Where to send the user to install the App, carrying a signed marker of who is installing. */
export function buildInstallUrl(config: GithubAppConfig, actor: Actor, now?: number): string {
  const state = signInstallState(actor, config.webhookSecret, now);
  return `https://github.com/apps/${encodeURIComponent(config.slug)}/installations/new?state=${encodeURIComponent(state)}`;
}

/**
 * Records the installation GitHub just sent the user back from. The state
 * marker must be genuine, unexpired, and issued to this same user and org;
 * the installation id is confirmed with GitHub before anything is stored.
 * Replaying the callback returns the existing row.
 */
export async function completeInstall(
  db: Db,
  config: GithubAppConfig,
  actor: Actor,
  params: { state: string | null; githubInstallationId: number },
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
  fetchImpl?: typeof fetch,
): Promise<Installation> {
  const marker = verifyInstallState(params.state, config.webhookSecret);
  if (marker.organizationId !== actor.organizationId || marker.userId !== actor.userId) {
    throw new InvalidInstallStateError();
  }

  const existing = await findByGithubInstallationId(db, params.githubInstallationId);
  if (existing) return existing;

  const account = await fetchInstallationAccount(config, params.githubInstallationId, fetchImpl);
  const id = randomUUID();
  try {
    return await withAudit(
      db,
      (tx) =>
        insertInstallation(tx, {
          id,
          organizationId: actor.organizationId,
          githubInstallationId: params.githubInstallationId,
          githubAccountLogin: account.login,
          githubAccountType: account.type,
        }),
      (tx) =>
        record(tx, {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          actorApiKeyId: null,
          action: "vcs_installation.created",
          resourceType: "vcs_installation",
          resourceId: id,
          after: { githubInstallationId: params.githubInstallationId, githubAccountLogin: account.login },
          transport: auditContext.transport,
          sourceIp: auditContext.sourceIp,
        }),
    );
  } catch (err) {
    // Another org's row is invisible under RLS, so a duplicate means it belongs to someone else.
    if (isUniqueViolation(err)) throw new InstallationOwnedByAnotherOrganizationError();
    throw err;
  }
}

/** The organization's active (not deleted) installations. */
export async function listInstallations(db: Db, organizationId: string): Promise<Installation[]> {
  return listActiveByOrg(db, organizationId);
}

/**
 * Mints a short-lived access token for an active installation. Refuses a
 * suspended, deleted or unknown installation without calling GitHub. The
 * token is returned to the caller for one use and never stored or logged.
 */
export async function getInstallationAccessToken(
  db: Db,
  config: GithubAppConfig,
  organizationId: string,
  installationId: string,
  fetchImpl?: typeof fetch,
): Promise<string> {
  const row = await findByOrgAndId(db, organizationId, installationId);
  if (!row || row.deletedAt || row.suspendedAt) throw new InstallationNotActiveError();
  return mintInstallationToken(config, row.githubInstallationId, fetchImpl);
}
