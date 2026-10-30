import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authenticateSession } from "@/bcs/identity-access";
import { listProjectsByOrganization } from "@/bcs/prompt-registry";
import { getGithubAppConfig, listAccessibleRepos, listInstallations, listRepoLinks } from "@/bcs/vcs-integration";
import { authDb, db, withTenantContext } from "@/shared/db";
import { GithubIntegrationView } from "./github-integration-view";
import { linkRepoAction, startInstallAction, unlinkRepoAction } from "./actions";

type Query = { installed?: string; linked?: string; unlinked?: string; error?: string; installation?: string };

export default async function GithubIntegrationPage({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await authenticateSession(authDb, (await headers()).get("cookie"));
  if (!user) redirect("/login");

  const query = await searchParams;
  const config = getGithubAppConfig();
  const data = config
    ? await withTenantContext(db, user.orgId, async (tx) => {
        const installations = await listInstallations(tx, user.orgId);
        const selected = installations.find((i) => i.id === query.installation) ?? installations[0];
        let repos: Array<{ id: number; fullName: string }> = [];
        let repoError = false;
        if (selected && user.role === "admin") {
          try {
            repos = await listAccessibleRepos(tx, config, user.orgId, selected.id);
          } catch {
            repoError = true;
          }
        }
        const projects = (await listProjectsByOrganization(tx, user.orgId)).map((p) => ({ id: p.id, name: p.name }));
        const links = await listRepoLinks(tx, user.orgId);
        return { installations, selected, repos, repoError, projects, links };
      })
    : null;

  const projectName = new Map((data?.projects ?? []).map((p) => [p.id, p.name]));
  const notice = query.installed ? "installed" : query.linked ? "linked" : query.unlinked ? "unlinked" : query.error ? "error" : null;

  return (
    <GithubIntegrationView
      configured={config !== null}
      isAdmin={user.role === "admin"}
      installations={(data?.installations ?? []).map((i) => ({ id: i.id, login: i.githubAccountLogin, type: i.githubAccountType, suspended: i.suspendedAt !== null }))}
      selectedInstallationId={data?.selected?.id ?? null}
      repos={data?.repos ?? []}
      repoError={data?.repoError ?? false}
      projects={data?.projects ?? []}
      links={(data?.links ?? []).map((l) => ({
        id: l.id,
        repo: l.repoFullName,
        account: l.installationAccountLogin,
        project: projectName.get(l.projectId) ?? l.projectId,
        projectId: l.projectId,
      }))}
      notice={notice}
      errorMessage={query.error ? decodeURIComponent(query.error) : null}
      installAction={startInstallAction}
      linkAction={linkRepoAction}
      unlinkAction={unlinkRepoAction}
    />
  );
}
