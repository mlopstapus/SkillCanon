import { z } from "zod";
import { addProjectRepo, listProjectRepos } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import type { ResolvedCaller } from "@/shared/api/auth";

interface Params {
  projectId: string;
}

const addProjectRepoSchema = z.object({
  name: z.string().min(1),
  url: z.string().min(1),
  branch: z.string().optional(),
});

/** `addProjectRepo` throws the registered `ProjectNotFoundError`/`DuplicateProjectRepoError`/authorization errors — flows through `mapError` normally. */
export async function handlePost(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  const body = addProjectRepoSchema.parse(await request.json());
  const result = await withTenantContext(db, caller.organizationId, (tx) =>
    addProjectRepo(tx, caller.actingUser, params.projectId, body, caller.auditContext),
  );
  return Response.json(result, { status: 201 });
}

/** `listProjectRepos` throws the registered `ProjectNotFoundError` for a nonexistent/cross-org project. */
export async function handleGet(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  const repos = await withTenantContext(db, caller.organizationId, (tx) =>
    listProjectRepos(tx, caller.organizationId, params.projectId),
  );
  return Response.json(repos);
}

export const POST = withApiRoute<Params>(handlePost);
export const GET = withApiRoute<Params>(handleGet);
