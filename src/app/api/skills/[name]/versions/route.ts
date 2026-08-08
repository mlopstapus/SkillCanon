import { z } from "zod";
import { listVersions, publishVersion } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import type { ResolvedCaller } from "@/shared/api/auth";

interface Params {
  name: string;
}

const chainStepSchema = z.object({
  id: z.string().min(1),
  promptName: z.string().min(1),
  promptVersion: z.string().optional(),
  dependsOn: z.array(z.string()),
});

const fileSchema = z.object({
  name: z.string().min(1),
  content: z.string(),
});

const publishVersionSchema = z.object({
  version: z.string().min(1),
  mainFile: z.object({ content: z.string() }).optional(),
  supportingFiles: z.array(fileSchema).optional(),
  steps: z.array(chainStepSchema).optional(),
  tags: z.array(z.string()).optional(),
});

/**
 * `publishVersion`'s real signature (read from
 * `application/publish-version.ts`) takes `params.promptName`, not a
 * `promptId` resolved via a separate `getPrompt` call first — it resolves
 * the prompt by name internally and throws the registered
 * `PromptNotFoundError` (SKILL_NOT_FOUND) itself. No extra lookup needed
 * here, unlike the subscribe/fork routes.
 */
export async function handlePost(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  const body = publishVersionSchema.parse(await request.json());
  const result = await withTenantContext(db, caller.organizationId, (tx) =>
    publishVersion(
      tx,
      { organizationId: caller.organizationId, userId: caller.actingUser.id },
      { organizationId: caller.organizationId, promptName: params.name, ...body },
      caller.auditContext,
    ),
  );
  return Response.json(result, { status: 201 });
}

/** `listVersions` also takes `promptName` directly and throws `PromptNotFoundError` for a missing prompt. */
export async function handleGet(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  const versions = await withTenantContext(db, caller.organizationId, (tx) =>
    listVersions(tx, { organizationId: caller.organizationId, userId: caller.actingUser.id }, params.name),
  );
  return Response.json(versions);
}

export const POST = withApiRoute<Params>(handlePost);
export const GET = withApiRoute<Params>(handleGet);
