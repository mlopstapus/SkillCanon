import { getProject, getProjectMetrics } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import { notFoundResponse } from "@/shared/api/errors";
import type { ResolvedCaller } from "@/shared/api/auth";

interface Params {
  projectId: string;
}

/**
 * `getProjectMetrics` performs no project-existence check on its own —
 * it composes `distribution`'s usage summary plus this BC's own
 * membership/assignment data, all of which resolve to empty/zeroed results
 * for a nonexistent project rather than throwing or returning `null`. An
 * explicit `getProject` lookup is added for the same 404 `PROJECT_NOT_FOUND`
 * consistency as every sibling `/api/projects/{id}/*` route.
 */
export async function handleGet(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  const result = await withTenantContext(db, caller.organizationId, async (tx) => {
    const project = await getProject(tx, caller.organizationId, params.projectId);
    if (!project) {
      return null;
    }
    return getProjectMetrics(tx, caller.organizationId, params.projectId);
  });

  if (result === null) {
    const mapped = notFoundResponse("PROJECT_NOT_FOUND", "Project not found");
    return Response.json(mapped.body, { status: mapped.status });
  }
  return Response.json(result);
}

export const GET = withApiRoute<Params>(handleGet);
