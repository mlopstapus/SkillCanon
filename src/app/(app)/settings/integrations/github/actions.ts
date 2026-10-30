"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authenticateSession } from "@/bcs/identity-access";
import { getProject } from "@/bcs/prompt-registry";
import { buildInstallUrl, getGithubAppConfig, linkRepo, unlinkRepo } from "@/bcs/vcs-integration";
import { authDb, db, withTenantContext } from "@/shared/db";

/** Sends an org admin to GitHub's install page for the SkillCanon App. */
export async function startInstallAction(): Promise<void> {
  const user = await authenticateSession(authDb, (await headers()).get("cookie"));
  const config = getGithubAppConfig();
  if (!user || user.role !== "admin" || !config) redirect("/settings/integrations/github?error=unavailable");
  redirect(buildInstallUrl(config, { organizationId: user.orgId, userId: user.id }));
}

async function requireAdminUser() {
  const user = await authenticateSession(authDb, (await headers()).get("cookie"));
  if (!user) redirect("/login");
  return user;
}

const PAGE = "/settings/integrations/github";

/** Links a repo from an installation to a project (org admin only, enforced in the BC). */
export async function linkRepoAction(formData: FormData): Promise<void> {
  const user = await requireAdminUser();
  const config = getGithubAppConfig();
  const installationId = String(formData.get("installationId") ?? "");
  let outcome = "linked=1";
  try {
    if (!config) throw new Error("not configured");
    await withTenantContext(db, user.orgId, (tx) =>
      linkRepo(
        tx,
        config,
        { organizationId: user.orgId, userId: user.id, role: user.role },
        { installationId, githubRepoId: Number(formData.get("githubRepoId")), projectId: String(formData.get("projectId") ?? "") },
        { projectExists: async (projectId) => (await getProject(tx, user.orgId, projectId)) != null },
      ),
    );
  } catch (err) {
    outcome = `error=${err instanceof Error ? encodeURIComponent(err.message) : "failed"}`;
  }
  redirect(`${PAGE}?${outcome}`);
}

export async function unlinkRepoAction(formData: FormData): Promise<void> {
  const user = await requireAdminUser();
  let outcome = "unlinked=1";
  try {
    await withTenantContext(db, user.orgId, (tx) =>
      unlinkRepo(tx, { organizationId: user.orgId, userId: user.id, role: user.role }, String(formData.get("repoLinkId") ?? "")),
    );
  } catch (err) {
    outcome = `error=${err instanceof Error ? encodeURIComponent(err.message) : "failed"}`;
  }
  redirect(`${PAGE}?${outcome}`);
}
