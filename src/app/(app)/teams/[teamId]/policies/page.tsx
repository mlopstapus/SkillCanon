import { headers } from "next/headers";
import { GovernancePage } from "../governance-page";
import { loadGovernancePageData } from "../load-governance-page-data";

export default async function TeamPoliciesPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ person?: string }>;
}) {
  const { teamId } = await params;
  const { person } = await searchParams;
  const cookieHeader = (await headers()).get("cookie");
  const data = await loadGovernancePageData(teamId, person, cookieHeader);
  const teamsById = new Map(data.teams.map((team) => [team.id, team]));

  return (
    <GovernancePage
      routeTeamId={teamId}
      initialTab="policies"
      initialScope={data.scope}
      teamsById={teamsById}
      rows={data.rows}
      policies={data.policies}
      objectives={data.objectives}
    />
  );
}
