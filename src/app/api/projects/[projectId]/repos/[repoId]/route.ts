import { removeProjectRepo } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import type { ResolvedCaller } from "@/shared/api/auth";

interface Params {
  projectId: string;
  repoId: string;
}

/** `removeProjectRepo` throws the registered `ProjectNotFoundError`/`ProjectRepoNotFoundError`/authorization errors — flows through `mapError` normally. */
export async function handleDelete(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  await withTenantContext(db, caller.organizationId, (tx) =>
    removeProjectRepo(tx, caller.actingUser, params.projectId, params.repoId, caller.auditContext),
  );
  return new Response(null, { status: 204 });
}

export const DELETE = withApiRoute<Params>(handleDelete);
