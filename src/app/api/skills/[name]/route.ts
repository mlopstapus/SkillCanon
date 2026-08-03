import { deprecatePrompt, getPrompt } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import { notFoundResponse } from "@/shared/api/errors";
import type { ResolvedCaller } from "@/shared/api/auth";

interface Params {
  name: string;
}

/** `getPrompt` returns `null` for "not found" — mapped explicitly to SKILL_NOT_FOUND (data-model.md's three-shapes decision, shape 1). */
export async function handleGet(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  const prompt = await withTenantContext(db, caller.organizationId, (tx) =>
    getPrompt(tx, { organizationId: caller.organizationId, userId: caller.actingUser.id }, params.name),
  );
  if (!prompt) {
    const mapped = notFoundResponse("SKILL_NOT_FOUND", "Skill not found");
    return Response.json(mapped.body, { status: mapped.status });
  }
  return Response.json(prompt);
}

/** `deprecatePrompt` throws the registered `PromptNotFoundError` (SKILL_NOT_FOUND, 404) — flows through the shared mapper untouched. */
export async function handleDelete(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  const result = await withTenantContext(db, caller.organizationId, (tx) =>
    deprecatePrompt(
      tx,
      { organizationId: caller.organizationId, userId: caller.actingUser.id },
      params.name,
      caller.auditContext,
    ),
  );
  return Response.json(result);
}

export const GET = withApiRoute<Params>(handleGet);
export const DELETE = withApiRoute<Params>(handleDelete);
