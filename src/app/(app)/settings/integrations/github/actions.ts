"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authenticateSession } from "@/bcs/identity-access";
import { buildInstallUrl, getGithubAppConfig } from "@/bcs/vcs-integration";
import { authDb } from "@/shared/db";

/** Sends an org admin to GitHub's install page for the SkillCanon App. */
export async function startInstallAction(): Promise<void> {
  const user = await authenticateSession(authDb, (await headers()).get("cookie"));
  const config = getGithubAppConfig();
  if (!user || user.role !== "admin" || !config) redirect("/settings/integrations/github?error=unavailable");
  redirect(buildInstallUrl(config, { organizationId: user.orgId, userId: user.id }));
}
