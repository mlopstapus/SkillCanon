import { z } from "zod";
import { createProject, listProjectsByOrganization, listProjectsByTeam } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import { paginate, parsePageParams } from "@/shared/api/pagination";
import type { ResolvedCaller } from "@/shared/api/auth";
import { makeProjectIdentityVerifier } from "./project-identity-verifier";

const createProjectSchema = z.object({
  teamId: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  leadUserId: z.string().optional(),
  description: z.string().optional(),
});

export async function handlePost(request: Request, { caller, db }: { caller: ResolvedCaller; db: Db }) {
  const body = createProjectSchema.parse(await request.json());
  const actor = { organizationId: caller.organizationId, userId: caller.actingUser.id };
  const result = await withTenantContext(db, caller.organizationId, (tx) =>
    createProject(
      tx,
      actor,
      { organizationId: caller.organizationId, ...body },
      makeProjectIdentityVerifier(tx),
      caller.auditContext,
    ),
  );
  return Response.json(result, { status: 201 });
}

export async function handleGet(request: Request, { caller, db }: { caller: ResolvedCaller; db: Db }) {
  const url = new URL(request.url);
  const pageParams = parsePageParams(url);
  const teamId = url.searchParams.get("teamId");

  const projects = await withTenantContext(db, caller.organizationId, (tx) =>
    teamId
      ? listProjectsByTeam(tx, caller.organizationId, teamId)
      : listProjectsByOrganization(tx, caller.organizationId),
  );

  return Response.json(paginate(projects, pageParams));
}

export const POST = withApiRoute(handlePost);
export const GET = withApiRoute(handleGet);
