import { getServe } from "@/bcs/distribution";
import { getPromptById } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import { notFoundResponse } from "@/shared/api/errors";
import type { ResolvedCaller } from "@/shared/api/auth";

interface Params {
  serveId: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function handleGet(
  _request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  const found = UUID.test(params.serveId)
    ? await withTenantContext(db, caller.organizationId, async (tx) => {
        const serve = await getServe(tx, caller.organizationId, params.serveId);
        if (!serve) return null;
        const prompt = await getPromptById(tx, caller.organizationId, serve.promptId);
        return { serve, skill: prompt?.name ?? null };
      })
    : null;
  if (!found) {
    const mapped = notFoundResponse("SERVE_NOT_FOUND", "Serve not found");
    return Response.json(mapped.body, { status: mapped.status });
  }
  const { serve, skill } = found;
  return Response.json({
    serveId: serve.serveId,
    skill,
    version: serve.version,
    contentDigest: serve.contentDigest,
    createdAt: serve.createdAt,
    userId: serve.userId,
    projectId: serve.projectId,
  });
}

export const GET = withApiRoute<Params>(handleGet);
