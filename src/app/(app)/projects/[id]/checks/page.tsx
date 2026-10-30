import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { authenticateSession } from "@/bcs/identity-access";
import { getProject, listProjectRepos } from "@/bcs/prompt-registry";
import { getComplianceSummaryForProject, listInstallations, listRecentPrChecksForProject, listRepoLinks } from "@/bcs/vcs-integration";
import { authDb, db, withTenantContext } from "@/shared/db";
import { ProjectChecksView } from "./project-checks-view";

const WINDOW_DAYS = 30;

const windowStart = (days: number) => new Date(Date.now() - days * 86_400_000);

export default async function ProjectChecksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await authenticateSession(authDb, (await headers()).get("cookie"));
  if (!user) redirect("/login");

  const data = await withTenantContext(db, user.orgId, async (tx) => {
    const project = await getProject(tx, user.orgId, id);
    if (!project) return null;
    const since = windowStart(WINDOW_DAYS);
    const [installations, links, summary, checks] = await Promise.all([
      listInstallations(tx, user.orgId),
      listRepoLinks(tx, user.orgId, id),
      getComplianceSummaryForProject(tx, user.orgId, id, { since }),
      listRecentPrChecksForProject(tx, user.orgId, id),
    ]);
    return { project, installations, links, summary, checks };
  });
  if (!data) notFound();

  return (
    <ProjectChecksView
      projectId={id}
      projectName={data.project.name}
      windowDays={WINDOW_DAYS}
      hasInstallation={data.installations.length > 0}
      linkedRepos={data.links.map((l) => l.repoFullName)}
      summary={data.summary}
      checks={data.checks.map((c) => ({
        id: c.id,
        repo: c.repoFullName,
        prNumber: c.prNumber,
        status: c.status,
        headSha: c.headSha,
        evaluatedAt: c.evaluatedAt.toISOString().slice(0, 16).replace("T", " ") + " UTC",
        satisfied: c.results.filter((r) => r.satisfied).map((r) => r.skillName),
        missing: c.results.filter((r) => !r.satisfied).map((r) => r.skillName),
        error: c.error,
      }))}
    />
  );
}
