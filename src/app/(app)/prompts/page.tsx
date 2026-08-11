import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  listPrompts,
  listProjectSkillAssignmentsForOrganization,
  listProjectsByOrganization,
  listVersions,
} from "@/bcs/prompt-registry";
import { authenticateSession, listTeams, listUsers } from "@/bcs/identity-access";
import { authDb, db, withTenantContext } from "@/shared/db";
import { PromptsList } from "./prompts-list";
import type { PromptListRow } from "./prompts-list-view";

export default async function PromptsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const cookieHeader = (await headers()).get("cookie");
  const user = await authenticateSession(authDb, cookieHeader);

  if (!user) {
    redirect("/login");
  }

  const resolvedSearchParams = await searchParams;
  const q = (typeof resolvedSearchParams.q === "string" ? resolvedSearchParams.q : "").trim().toLowerCase();
  const projectFilter = typeof resolvedSearchParams.project === "string" ? resolvedSearchParams.project : "all";
  const ownerFilter = typeof resolvedSearchParams.owner === "string" ? resolvedSearchParams.owner : "all";

  const { rows, projectOptions, existingNames } = await withTenantContext(db, user.orgId, async (tx) => {
    const actor = { organizationId: user.orgId, userId: user.id };
    const [prompts, assignments, projects, users, teams] = await Promise.all([
      listPrompts(tx, actor),
      listProjectSkillAssignmentsForOrganization(tx, user.orgId),
      listProjectsByOrganization(tx, user.orgId),
      listUsers(tx, user),
      listTeams(tx, user.orgId),
    ]);

    const userNameById = new Map(users.map((u) => [u.id, u.displayName]));
    const teamNameById = new Map(teams.map((t) => [t.id, t.name]));
    const projectNameById = new Map(projects.map((p) => [p.id, p.name]));
    const projectIdsBySkillId = new Map<string, string[]>();
    for (const a of assignments) {
      const list = projectIdsBySkillId.get(a.skillId) ?? [];
      list.push(a.projectId);
      projectIdsBySkillId.set(a.skillId, list);
    }

    const resolved: PromptListRow[] = await Promise.all(
      prompts.map(async (p) => {
        const ownerLabel =
          (p.ownerType === "user" ? userNameById.get(p.ownerId) : teamNameById.get(p.ownerId)) ?? p.ownerId;
        const versions = await listVersions(tx, actor, p.name);
        const activeVersion = versions.find((v) => v.id === p.activeVersionId) ?? null;
        const projectIds = projectIdsBySkillId.get(p.id) ?? [];
        return {
          id: p.id,
          name: p.name,
          description: p.description ?? "",
          isDeprecated: p.isDeprecated,
          isOwnedByMe: p.ownerType === "user" && p.ownerId === user.id,
          projectIds,
          projectLabels: projectIds.map((id) => projectNameById.get(id)).filter((n): n is string => !!n),
          ownerLabel,
          activeVersion: activeVersion?.version ?? null,
          tags: (activeVersion?.tags as string[] | undefined) ?? [],
          updatedAt: p.updatedAt.toISOString().slice(0, 10),
        };
      }),
    );

    const filtered = resolved.filter((row) => {
      if (projectFilter !== "all" && !row.projectIds.includes(projectFilter)) return false;
      if (ownerFilter === "mine" && !row.isOwnedByMe) return false;
      if (ownerFilter === "shared" && row.isOwnedByMe) return false;
      if (q && !(row.name + " " + row.description).toLowerCase().includes(q)) return false;
      return true;
    });

    return {
      rows: filtered.sort((a, b) => a.name.localeCompare(b.name)),
      projectOptions: projects.map((p) => ({ id: p.id, name: p.name })).sort((a, b) => a.name.localeCompare(b.name)),
      existingNames: resolved.map((r) => r.name),
    };
  });

  return (
    <PromptsList
      rows={rows}
      projectOptions={projectOptions}
      filters={{ q, project: projectFilter, owner: ownerFilter }}
      existingNames={existingNames}
    />
  );
}
