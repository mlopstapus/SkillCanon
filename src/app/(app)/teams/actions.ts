"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  authenticateSession,
  createTeam,
  insertTeamBetween,
  inviteUser,
  removeTeamMember,
  reparentTeam,
  updateTeam,
  updateUser,
} from "@/bcs/identity-access";
import { authDb, db, withTenantContext } from "@/shared/db";

export type TeamActionResult = { ok: true } | { ok: false; error: string };

async function requireActingUser() {
  const cookieHeader = (await headers()).get("cookie");
  const user = await authenticateSession(authDb, cookieHeader);
  if (!user) {
    throw new Error("Not signed in.");
  }
  return user;
}

export async function createTeamAction(params: {
  name: string;
  slug: string;
  description?: string;
  ownerId?: string;
  parentTeamId?: string;
}): Promise<TeamActionResult> {
  try {
    const actingUser = await requireActingUser();
    await withTenantContext(db, actingUser.orgId, (tx) =>
      createTeam(
        tx,
        { organizationId: actingUser.orgId, ...params },
        { actingUser },
      ),
    );
    revalidatePath("/teams");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export async function updateTeamAction(params: {
  teamId: string;
  name?: string;
  slug?: string;
  description?: string;
  ownerId?: string;
  /** Present only when the admin actively changed the parent selection — reparenting to root isn't supported (no application function exposes it; docs/stubs.md tracks it). */
  newParentTeamId?: string;
}): Promise<TeamActionResult> {
  try {
    const actingUser = await requireActingUser();
    const { teamId, newParentTeamId, ...fields } = params;
    await withTenantContext(db, actingUser.orgId, async (tx) => {
      await updateTeam(tx, actingUser.orgId, teamId, fields, actingUser);
      if (newParentTeamId) {
        await reparentTeam(tx, teamId, newParentTeamId, actingUser);
      }
    });
    revalidatePath("/teams");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export async function insertTeamBetweenAction(params: {
  childTeamId: string;
  name: string;
  slug: string;
  description?: string;
  ownerId?: string;
}): Promise<TeamActionResult> {
  try {
    const actingUser = await requireActingUser();
    const { childTeamId, ...fields } = params;
    await withTenantContext(db, actingUser.orgId, (tx) =>
      insertTeamBetween(
        tx,
        { organizationId: actingUser.orgId, ...fields },
        childTeamId,
        actingUser,
      ),
    );
    revalidatePath("/teams");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export async function inviteMemberAction(params: {
  teamId: string;
  email: string;
  role?: "admin" | "member";
}): Promise<TeamActionResult> {
  try {
    const actingUser = await requireActingUser();
    await withTenantContext(db, actingUser.orgId, (tx) => inviteUser(tx, actingUser, params));
    revalidatePath("/teams");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export async function removeMemberAction(params: {
  targetUserId: string;
}): Promise<TeamActionResult> {
  try {
    const actingUser = await requireActingUser();
    await withTenantContext(db, actingUser.orgId, (tx) =>
      removeTeamMember(tx, actingUser, params.targetUserId),
    );
    revalidatePath("/teams");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export async function assignUserToTeamAction(params: {
  targetUserId: string;
  teamId: string;
}): Promise<TeamActionResult> {
  try {
    const actingUser = await requireActingUser();
    await withTenantContext(db, actingUser.orgId, (tx) =>
      updateUser(tx, actingUser, params.targetUserId, { teamId: params.teamId }),
    );
    revalidatePath("/teams");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}
