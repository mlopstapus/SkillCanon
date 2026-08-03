import { z } from "zod";
import { createTeam, listTeams } from "@/bcs/identity-access";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import { paginate, parsePageParams } from "@/shared/api/pagination";
import type { ResolvedCaller } from "@/shared/api/auth";

const createTeamSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
  ownerId: z.string().optional(),
  parentTeamId: z.string().optional(),
});

export async function handlePost(request: Request, { caller, db }: { caller: ResolvedCaller; db: Db }) {
  const body = createTeamSchema.parse(await request.json());
  const result = await withTenantContext(db, caller.organizationId, (tx) =>
    createTeam(
      tx,
      { organizationId: caller.organizationId, ...body },
      { actingUser: caller.actingUser, auditContext: caller.auditContext },
    ),
  );
  return Response.json(result, { status: 201 });
}

export async function handleGet(request: Request, { caller, db }: { caller: ResolvedCaller; db: Db }) {
  const url = new URL(request.url);
  const pageParams = parsePageParams(url);
  const parentTeamId = url.searchParams.get("parentTeamId");

  const teams = await withTenantContext(db, caller.organizationId, (tx) => listTeams(tx, caller.organizationId));
  const filtered = parentTeamId === null ? teams : teams.filter((team) => team.parentTeamId === parentTeamId);

  return Response.json(paginate(filtered, pageParams));
}

export const POST = withApiRoute(handlePost);
export const GET = withApiRoute(handleGet);
