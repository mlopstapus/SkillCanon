import { z } from "zod";
import { recordPromptUsage } from "@/bcs/distribution";
import { expand, fetchExpandableVersion } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import type { ResolvedCaller } from "@/shared/api/auth";

interface Params {
  name: string;
}

const expandSchema = z.object({
  version: z.string().optional(),
  projectId: z.string().optional(),
  gitRemoteUrl: z.string().nullable().optional(),
  gitBranch: z.string().nullable().optional(),
  gitCommitSha: z.string().nullable().optional(),
});

/**
 * Authenticated genuine runtime expansion. Preview/test callers use the
 * prompt-registry `expand()` service directly and therefore do not record
 * Distribution usage telemetry.
 */
export async function handlePost(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  const startedAt = Date.now();
  const body = expandSchema.parse(await request.json());
  const versionToRecord = await withTenantContext(db, caller.organizationId, (tx) =>
    fetchExpandableVersion(tx, caller.organizationId, params.name, body.version),
  );

  try {
    const result = await withTenantContext(db, caller.organizationId, (tx) =>
      expand(tx, {
        organizationId: caller.organizationId,
        promptName: params.name,
        userId: caller.actingUser.id,
        projectId: body.projectId,
        version: body.version,
      }),
    );

    if (versionToRecord && versionToRecord.kind === "template") {
      await withTenantContext(db, caller.organizationId, (tx) =>
        recordPromptUsage(tx, {
          organizationId: caller.organizationId,
          promptId: versionToRecord.promptId,
          promptVersionId: versionToRecord.id,
          promptVersion: versionToRecord.version,
          projectId: body.projectId ?? null,
          userId: caller.actingUser.id,
          statusCode: 200,
          latencyMs: Date.now() - startedAt,
          gitRemoteUrl: body.gitRemoteUrl ?? null,
          gitBranch: body.gitBranch ?? null,
          gitCommitSha: body.gitCommitSha ?? null,
        }),
      );
    }

    return Response.json(result);
  } catch (err) {
    if (versionToRecord && versionToRecord.kind === "template") {
      await withTenantContext(db, caller.organizationId, (tx) =>
        recordPromptUsage(tx, {
          organizationId: caller.organizationId,
          promptId: versionToRecord.promptId,
          promptVersionId: versionToRecord.id,
          promptVersion: versionToRecord.version,
          projectId: body.projectId ?? null,
          userId: caller.actingUser.id,
          statusCode: 500,
          latencyMs: Date.now() - startedAt,
          gitRemoteUrl: body.gitRemoteUrl ?? null,
          gitBranch: body.gitBranch ?? null,
          gitCommitSha: body.gitCommitSha ?? null,
        }),
      );
    }
    throw err;
  }
}

export const POST = withApiRoute<Params>(handlePost);
