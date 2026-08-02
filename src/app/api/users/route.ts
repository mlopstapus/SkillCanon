import { z } from "zod";
import { createUser, listUsers } from "@/bcs/identity-access";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import { paginate, parsePageParams } from "@/shared/api/pagination";
import type { ResolvedCaller } from "@/shared/api/auth";

const createUserSchema = z.object({
  teamId: z.string().min(1),
  username: z.string().min(1),
  displayName: z.string().optional(),
  email: z.string().email(),
  password: z.string().min(1),
  role: z.enum(["admin", "member"]).optional(),
});

export async function handlePost(request: Request, { caller, db }: { caller: ResolvedCaller; db: Db }) {
  const body = createUserSchema.parse(await request.json());
  const result = await withTenantContext(db, caller.organizationId, (tx) =>
    createUser(tx, caller.actingUser, body, { auditContext: caller.auditContext }),
  );
  return Response.json(result, { status: 201 });
}

export async function handleGet(request: Request, { caller, db }: { caller: ResolvedCaller; db: Db }) {
  const url = new URL(request.url);
  const pageParams = parsePageParams(url);
  const teamId = url.searchParams.get("teamId");

  const users = await withTenantContext(db, caller.organizationId, (tx) =>
    listUsers(tx, caller.actingUser, teamId ? { teamId } : undefined),
  );

  return Response.json(paginate(users, pageParams));
}

export const POST = withApiRoute(handlePost);
export const GET = withApiRoute(handleGet);
