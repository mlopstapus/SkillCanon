import { z } from "zod";
import { rollbackPrompt } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import type { ResolvedCaller } from "@/shared/api/auth";

interface Params {
  name: string;
}

const rollbackSchema = z.object({
  version: z.string().min(1),
});

/** `rollbackPrompt` throws `PromptNotFoundError`/`PromptVersionNotFoundError` — both registered, flow through the shared mapper untouched. */
export async function handlePost(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  const body = rollbackSchema.parse(await request.json());
  const result = await withTenantContext(db, caller.organizationId, (tx) =>
    rollbackPrompt(
      tx,
      { organizationId: caller.organizationId, userId: caller.actingUser.id },
      params.name,
      body.version,
      caller.auditContext,
    ),
  );
  return Response.json(result);
}

export const POST = withApiRoute<Params>(handlePost);
