import { randomUUID } from "node:crypto";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { record, DEFAULT_WEB_AUDIT_CONTEXT, type AuditContext } from "@/bcs/audit-compliance";
import { isUniqueViolation, withAudit } from "@/shared/db";
import {
  DuplicateRepoLinkError,
  LinkProjectNotFoundError,
  RepoLinkNotFoundError,
  RepoNotAccessibleError,
  VcsNotAuthorizedError,
  type RepoLink,
} from "../domain/installation";
import { listInstallationRepositories, type GithubAppConfig, type GithubRepo } from "../infrastructure/github-app";
import {
  findByOrgAndId,
  findLiveRepoLink,
  insertRepoLink,
  listLiveRepoLinks,
  markRepoLinkUnlinked,
} from "../infrastructure/installations-repo";
import { getInstallationAccessToken } from "./installations";

type Db = PostgresJsDatabase<Record<string, never>>;
export interface VcsActor {
  organizationId: string;
  userId: string;
  role: "admin" | "member";
}

function assertAdmin(actor: VcsActor): void {
  if (actor.role !== "admin") throw new VcsNotAuthorizedError();
}

/** The repositories an installation can see, for the linking picker. */
export async function listAccessibleRepos(
  db: Db,
  config: GithubAppConfig,
  organizationId: string,
  installationId: string,
  fetchImpl?: typeof fetch,
): Promise<GithubRepo[]> {
  const token = await getInstallationAccessToken(db, config, organizationId, installationId, fetchImpl);
  return listInstallationRepositories(token, fetchImpl);
}

/**
 * Links a GitHub repo to a project. The repo id is checked against what
 * GitHub says the installation can actually see (never trusted from the
 * client), and the project must exist in the actor's organization
 * (`projectExists` is supplied by the composition root so this context never
 * reads another context's tables). Admin only.
 */
export async function linkRepo(
  db: Db,
  config: GithubAppConfig,
  actor: VcsActor,
  params: { installationId: string; githubRepoId: number; projectId: string },
  deps: { projectExists: (projectId: string) => Promise<boolean>; fetchImpl?: typeof fetch },
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
): Promise<RepoLink> {
  assertAdmin(actor);
  if (!(await deps.projectExists(params.projectId))) throw new LinkProjectNotFoundError();

  const installation = await findByOrgAndId(db, actor.organizationId, params.installationId);
  const repos = await listAccessibleRepos(db, config, actor.organizationId, params.installationId, deps.fetchImpl);
  const repo = repos.find((r) => r.id === params.githubRepoId);
  if (!installation || !repo) throw new RepoNotAccessibleError();

  const id = randomUUID();
  try {
    return await withAudit(
      db,
      (tx) =>
        insertRepoLink(tx, {
          id,
          organizationId: actor.organizationId,
          installationId: installation.id,
          githubRepoId: repo.id,
          repoFullName: repo.fullName,
          projectId: params.projectId,
          linkedByUserId: actor.userId,
        }),
      (tx) =>
        record(tx, {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          actorApiKeyId: null,
          action: "repo_link.created",
          resourceType: "repo_link",
          resourceId: id,
          after: { repoFullName: repo.fullName, projectId: params.projectId },
          transport: auditContext.transport,
          sourceIp: auditContext.sourceIp,
        }),
    );
  } catch (err) {
    if (isUniqueViolation(err)) throw new DuplicateRepoLinkError();
    throw err;
  }
}

/** Soft-unlinks: no new evaluations fire, existing check history stays readable. Admin only. */
export async function unlinkRepo(
  db: Db,
  actor: VcsActor,
  repoLinkId: string,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
): Promise<void> {
  assertAdmin(actor);
  const link = await findLiveRepoLink(db, actor.organizationId, repoLinkId);
  if (!link) throw new RepoLinkNotFoundError();
  await withAudit(
    db,
    (tx) => markRepoLinkUnlinked(tx, link.id, new Date()),
    (tx) =>
      record(tx, {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        actorApiKeyId: null,
        action: "repo_link.deleted",
        resourceType: "repo_link",
        resourceId: link.id,
        before: { repoFullName: link.repoFullName, projectId: link.projectId },
        transport: auditContext.transport,
        sourceIp: auditContext.sourceIp,
      }),
  );
}

export interface RepoLinkListItem extends RepoLink {
  installationAccountLogin: string | null;
}

/** Live links, optionally for one project, with the installation's account for display. */
export async function listRepoLinks(db: Db, organizationId: string, projectId?: string): Promise<RepoLinkListItem[]> {
  const links = await listLiveRepoLinks(db, organizationId, projectId);
  const logins = new Map<string, string>();
  for (const link of links) {
    if (!logins.has(link.installationId)) {
      const installation = await findByOrgAndId(db, organizationId, link.installationId);
      if (installation) logins.set(link.installationId, installation.githubAccountLogin);
    }
  }
  return links.map((l) => ({ ...l, installationAccountLogin: logins.get(l.installationId) ?? null }));
}
