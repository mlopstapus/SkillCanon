import { abandonSkillChainRun } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import type { ResolvedCaller } from "@/shared/api/auth";

interface Params {
  runId: string;
}

export async function handlePost(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  await withTenantContext(db, caller.organizationId, (tx) =>
    abandonSkillChainRun(
      tx,
      { organizationId: caller.organizationId, userId: caller.actingUser.id },
      params.runId,
      caller.auditContext,
    ),
  );
  return new Response(null, { status: 204 });
}

export const POST = withApiRoute<Params>(handlePost);
