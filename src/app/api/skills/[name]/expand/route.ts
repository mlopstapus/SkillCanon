import { z } from "zod";
import { expand } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import type { ResolvedCaller } from "@/shared/api/auth";

interface Params {
  name: string;
}

const expandSchema = z.object({
  input: z.record(z.string(), z.unknown()),
  version: z.string().optional(),
  projectId: z.string().optional(),
});

/**
 * Every route requires auth (FR-010) — unlike the legacy Python API's
 * anonymous `expand` endpoint, this one always resolves a caller and
 * threads it through as `userId` so governance (policies/objectives)
 * applies (research.md, FR-008).
 */
export async function handlePost(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  const body = expandSchema.parse(await request.json());
  const result = await withTenantContext(db, caller.organizationId, (tx) =>
    expand(tx, {
      organizationId: caller.organizationId,
      promptName: params.name,
      input: body.input,
      userId: caller.actingUser.id,
      projectId: body.projectId,
      version: body.version,
    }),
  );
  return Response.json(result);
}

export const POST = withApiRoute<Params>(handlePost);
