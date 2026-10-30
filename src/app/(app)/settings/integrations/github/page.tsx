import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authenticateSession } from "@/bcs/identity-access";
import { getGithubAppConfig, listInstallations } from "@/bcs/vcs-integration";
import { authDb, db, withTenantContext } from "@/shared/db";
import { GithubIntegrationView } from "./github-integration-view";
import { startInstallAction } from "./actions";

export default async function GithubIntegrationPage({
  searchParams,
}: {
  searchParams: Promise<{ installed?: string; error?: string }>;
}) {
  const user = await authenticateSession(authDb, (await headers()).get("cookie"));
  if (!user) redirect("/login");

  const configured = getGithubAppConfig() !== null;
  const installations = configured ? await withTenantContext(db, user.orgId, (tx) => listInstallations(tx, user.orgId)) : [];
  const query = await searchParams;

  return (
    <GithubIntegrationView
      configured={configured}
      isAdmin={user.role === "admin"}
      installations={installations.map((i) => ({
        id: i.id,
        login: i.githubAccountLogin,
        type: i.githubAccountType,
        suspended: i.suspendedAt !== null,
      }))}
      notice={query.installed ? "installed" : query.error ? "error" : null}
      installAction={startInstallAction}
    />
  );
}
