import { z } from "zod";
import { createObjective, listProjectObjectives, listTeamObjectives, listUserObjectives } from "@/bcs/governance";
import type { ObjectiveScopeVerifier } from "@/bcs/governance";
import { getTeam, getUser } from "@/bcs/identity-access";
import { getProject } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import type { ResolvedCaller } from "@/shared/api/auth";

const createObjectiveSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  teamId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  userId: z.string().nullable().optional(),
  parentObjectiveId: z.string().nullable().optional(),
  status: z.string().optional(),
});

/**
 * Exactly one of `teamId`/`userId`/`projectId` is required (contract). A
 * `.refine()` on the combined query-param object keeps the 422 response
 * flowing through the same `ZodError` → `mapError` path as every other
 * validation failure, rather than a second hand-built response shape.
 */
const listObjectivesQuerySchema = z
  .object({
    teamId: z.string().optional(),
    userId: z.string().optional(),
    projectId: z.string().optional(),
  })
  .refine(
    (data) => [data.teamId, data.userId, data.projectId].filter((value) => value !== undefined).length === 1,
    {
      message: "Exactly one of teamId, userId, or projectId is required",
      path: ["scope"],
    },
  );

/**
 * `createObjective(db, actor: ObjectiveActor, params, scopeVerifier,
 * auditContext?)` — a `ObjectiveScopeVerifier` (three optional checks:
 * team/project/user belong to the caller's org) is a required fourth
 * argument. Built here via `getTeam`/`getUser` (both throw a bare `Error`
 * for "not found") and `getProject` (returns `null`/`undefined` instead).
 */
export async function handlePost(request: Request, { caller, db }: { caller: ResolvedCaller; db: Db }) {
  const body = createObjectiveSchema.parse(await request.json());
  const actor = { organizationId: caller.organizationId, userId: caller.actingUser.id };

  const result = await withTenantContext(db, caller.organizationId, (tx) => {
    const verifier: ObjectiveScopeVerifier = {
      teamBelongsToOrganization: async (organizationId, teamId) => {
        try {
          await getTeam(tx, organizationId, teamId);
          return true;
        } catch {
          return false;
        }
      },
      projectBelongsToOrganization: async (organizationId, projectId) => {
        const project = await getProject(tx, organizationId, projectId);
        return project != null;
      },
      userBelongsToOrganization: async (organizationId, userId) => {
        try {
          await getUser(tx, userId, organizationId);
          return true;
        } catch {
          return false;
        }
      },
    };
    return createObjective(tx, actor, body, verifier, caller.auditContext);
  });
  return Response.json(result, { status: 201 });
}

export async function handleGet(request: Request, { caller, db }: { caller: ResolvedCaller; db: Db }) {
  const url = new URL(request.url);
  const query = listObjectivesQuerySchema.parse({
    teamId: url.searchParams.get("teamId") ?? undefined,
    userId: url.searchParams.get("userId") ?? undefined,
    projectId: url.searchParams.get("projectId") ?? undefined,
  });
  const actor = { organizationId: caller.organizationId, userId: caller.actingUser.id };

  const result = await withTenantContext(db, caller.organizationId, (tx) => {
    if (query.teamId !== undefined) {
      return listTeamObjectives(tx, actor, query.teamId);
    }
    if (query.userId !== undefined) {
      return listUserObjectives(tx, actor, query.userId);
    }
    return listProjectObjectives(tx, actor, query.projectId as string);
  });
  return Response.json(result);
}

export const POST = withApiRoute(handlePost);
export const GET = withApiRoute(handleGet);
