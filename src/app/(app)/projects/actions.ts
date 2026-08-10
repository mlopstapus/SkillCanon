"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  addCollaboratorTeam,
  addProjectMember,
  addProjectRepo,
  createProject,
  getProject,
  removeCollaboratorTeam,
  removeProjectMember,
  removeProjectRepo,
  updateProject,
} from "@/bcs/prompt-registry";
import { authenticateSession } from "@/bcs/identity-access";
import { createObjective, deleteObjective, updateObjective, type ObjectiveScopeVerifier } from "@/bcs/governance";
import { authDb, db, withTenantContext } from "@/shared/db";
import { makeProjectIdentityVerifier } from "./project-identity-verifier";

type Tx = PostgresJsDatabase<Record<string, never>>;

/**
 * Only `projectBelongsToOrganization` is implemented — this page only ever
 * sets `projectId` on an objective, never `teamId`/`userId`. Mirrors the
 * REST-layer twin at `src/app/api/projects/[projectId]/objectives/route.ts`
 * verbatim (034-project-scoped-governance-ui) — each layer gets its own
 * small copy of this adapter rather than a shared cross-route-group import,
 * per the same pattern `makeProjectIdentityVerifier` already established.
 */
function makeObjectiveScopeVerifier(tx: Tx): ObjectiveScopeVerifier {
  return {
    projectBelongsToOrganization: async (organizationId, projectId) => Boolean(await getProject(tx, organizationId, projectId)),
  };
}

export type ProjectActionResult = { ok: true } | { ok: false; error: string };

async function requireActingUser() {
  const cookieHeader = (await headers()).get("cookie");
  const user = await authenticateSession(authDb, cookieHeader);
  if (!user) {
    throw new Error("Not signed in.");
  }
  return user;
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${base || "project"}-${randomUUID().slice(0, 8)}`;
}

export async function createProjectAction(params: {
  name: string;
  teamId: string;
  leadUserId?: string;
  description?: string;
}): Promise<ProjectActionResult> {
  try {
    const actingUser = await requireActingUser();
    const actor = { organizationId: actingUser.orgId, userId: actingUser.id };
    await withTenantContext(db, actingUser.orgId, (tx) =>
      createProject(
        tx,
        actor,
        {
          organizationId: actingUser.orgId,
          teamId: params.teamId,
          leadUserId: params.leadUserId,
          name: params.name,
          slug: slugify(params.name),
          description: params.description,
        },
        makeProjectIdentityVerifier(tx),
      ),
    );
    revalidatePath("/projects");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export async function updateProjectAction(
  projectId: string,
  fields: { name?: string; leadUserId?: string | null; description?: string | null },
): Promise<ProjectActionResult> {
  try {
    const actingUser = await requireActingUser();
    const actor = { organizationId: actingUser.orgId, userId: actingUser.id };
    await withTenantContext(db, actingUser.orgId, (tx) =>
      updateProject(tx, actor, projectId, fields, makeProjectIdentityVerifier(tx)),
    );
    revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export async function addProjectMemberAction(
  projectId: string,
  userId: string,
  role?: string,
): Promise<ProjectActionResult> {
  try {
    const actingUser = await requireActingUser();
    const actor = { organizationId: actingUser.orgId, userId: actingUser.id };
    await withTenantContext(db, actingUser.orgId, (tx) =>
      addProjectMember(tx, actor, { projectId, userId, role }, makeProjectIdentityVerifier(tx)),
    );
    revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export async function removeProjectMemberAction(projectId: string, userId: string): Promise<ProjectActionResult> {
  try {
    const actingUser = await requireActingUser();
    const actor = { organizationId: actingUser.orgId, userId: actingUser.id };
    await withTenantContext(db, actingUser.orgId, (tx) => removeProjectMember(tx, actor, projectId, userId));
    revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export async function addCollaboratorTeamAction(projectId: string, teamId: string): Promise<ProjectActionResult> {
  try {
    const actingUser = await requireActingUser();
    await withTenantContext(db, actingUser.orgId, (tx) =>
      addCollaboratorTeam(tx, actingUser, projectId, { teamId }),
    );
    revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export async function removeCollaboratorTeamAction(projectId: string, teamId: string): Promise<ProjectActionResult> {
  try {
    const actingUser = await requireActingUser();
    await withTenantContext(db, actingUser.orgId, (tx) =>
      removeCollaboratorTeam(tx, actingUser, projectId, { teamId }),
    );
    revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export async function addProjectRepoAction(
  projectId: string,
  params: { name: string; url: string; branch?: string },
): Promise<ProjectActionResult> {
  try {
    const actingUser = await requireActingUser();
    await withTenantContext(db, actingUser.orgId, (tx) => addProjectRepo(tx, actingUser, projectId, params));
    revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export async function removeProjectRepoAction(projectId: string, repoId: string): Promise<ProjectActionResult> {
  try {
    const actingUser = await requireActingUser();
    await withTenantContext(db, actingUser.orgId, (tx) => removeProjectRepo(tx, actingUser, projectId, repoId));
    revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export async function createProjectObjectiveAction(
  projectId: string,
  values: { title: string; description: string },
): Promise<ProjectActionResult> {
  try {
    const actingUser = await requireActingUser();
    const actor = { organizationId: actingUser.orgId, userId: actingUser.id };
    await withTenantContext(db, actingUser.orgId, (tx) =>
      createObjective(
        tx,
        actor,
        { projectId, title: values.title, description: values.description || null },
        makeObjectiveScopeVerifier(tx),
      ),
    );
    revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export async function updateProjectObjectiveAction(
  projectId: string,
  objectiveId: string,
  values: { title: string; description: string },
): Promise<ProjectActionResult> {
  try {
    const actingUser = await requireActingUser();
    const actor = { organizationId: actingUser.orgId, userId: actingUser.id };
    await withTenantContext(db, actingUser.orgId, (tx) =>
      updateObjective(
        tx,
        actor,
        objectiveId,
        { title: values.title, description: values.description || null },
        makeObjectiveScopeVerifier(tx),
      ),
    );
    revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export async function deleteProjectObjectiveAction(
  projectId: string,
  objectiveId: string,
): Promise<ProjectActionResult> {
  try {
    const actingUser = await requireActingUser();
    const actor = { organizationId: actingUser.orgId, userId: actingUser.id };
    await withTenantContext(db, actingUser.orgId, (tx) => deleteObjective(tx, actor, objectiveId));
    revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}
