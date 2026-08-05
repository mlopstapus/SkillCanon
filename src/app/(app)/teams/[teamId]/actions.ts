"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  authenticateSession,
  getTeam,
  getUser,
} from "@/bcs/identity-access";
import {
  createObjective,
  createPolicy,
  deleteObjective,
  deletePolicy,
  updateObjective,
  updatePolicy,
  type ObjectiveScopeVerifier,
  type PolicyEnforcementType,
  type PolicyScopeVerifier,
} from "@/bcs/governance";
import { authDb, db, withTenantContext } from "@/shared/db";

type Tx = PostgresJsDatabase<Record<string, never>>;

export type GovernanceActionResult = { ok: true } | { ok: false; error: string };

async function requireActingUser() {
  const cookieHeader = (await headers()).get("cookie");
  const user = await authenticateSession(authDb, cookieHeader);
  if (!user) {
    throw new Error("Not signed in.");
  }
  return user;
}

/**
 * Same adapter pattern as project-identity-verifier.ts (023-prompt-registry-views-ui)
 * — composes identity-access's already-exported, throw-on-not-found
 * getters, wrapped as the boolean shape governance's own verifier
 * interfaces expect.
 */
function makePolicyScopeVerifier(tx: Tx): PolicyScopeVerifier {
  return {
    teamBelongsToOrganization: async (orgId, teamId) => {
      try {
        await getTeam(tx, orgId, teamId);
        return true;
      } catch {
        return false;
      }
    },
  };
}

function makeObjectiveScopeVerifier(tx: Tx): ObjectiveScopeVerifier {
  return {
    teamBelongsToOrganization: async (orgId, teamId) => {
      try {
        await getTeam(tx, orgId, teamId);
        return true;
      } catch {
        return false;
      }
    },
    userBelongsToOrganization: async (orgId, userId) => {
      try {
        await getUser(tx, userId, orgId);
        return true;
      } catch {
        return false;
      }
    },
  };
}

function revalidateGovernance(teamId: string) {
  revalidatePath(`/teams/${teamId}/policies`);
  revalidatePath(`/teams/${teamId}/objectives`);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}

export async function createPolicyAction(params: {
  routeTeamId: string;
  teamId: string;
  name: string;
  enforcementType: PolicyEnforcementType;
  priority: number;
  content: string;
}): Promise<GovernanceActionResult> {
  try {
    const actingUser = await requireActingUser();
    await withTenantContext(db, actingUser.orgId, (tx) =>
      createPolicy(
        tx,
        { organizationId: actingUser.orgId, userId: actingUser.id },
        { teamId: params.teamId, name: params.name, enforcementType: params.enforcementType, priority: params.priority, content: params.content },
        makePolicyScopeVerifier(tx),
      ),
    );
    revalidateGovernance(params.routeTeamId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function updatePolicyAction(params: {
  routeTeamId: string;
  policyId: string;
  name: string;
  enforcementType: PolicyEnforcementType;
  priority: number;
  content: string;
}): Promise<GovernanceActionResult> {
  try {
    const actingUser = await requireActingUser();
    await withTenantContext(db, actingUser.orgId, (tx) =>
      updatePolicy(
        tx,
        { organizationId: actingUser.orgId, userId: actingUser.id },
        params.policyId,
        { name: params.name, enforcementType: params.enforcementType, priority: params.priority, content: params.content },
      ),
    );
    revalidateGovernance(params.routeTeamId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function deletePolicyAction(params: {
  routeTeamId: string;
  policyId: string;
}): Promise<GovernanceActionResult> {
  try {
    const actingUser = await requireActingUser();
    await withTenantContext(db, actingUser.orgId, (tx) =>
      deletePolicy(tx, { organizationId: actingUser.orgId, userId: actingUser.id }, params.policyId),
    );
    revalidateGovernance(params.routeTeamId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function createObjectiveAction(params: {
  routeTeamId: string;
  teamId: string | null;
  userId: string | null;
  title: string;
  description: string;
}): Promise<GovernanceActionResult> {
  try {
    const actingUser = await requireActingUser();
    await withTenantContext(db, actingUser.orgId, (tx) =>
      createObjective(
        tx,
        { organizationId: actingUser.orgId, userId: actingUser.id },
        { teamId: params.teamId, userId: params.userId, title: params.title, description: params.description || null },
        makeObjectiveScopeVerifier(tx),
      ),
    );
    revalidateGovernance(params.routeTeamId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function updateObjectiveAction(params: {
  routeTeamId: string;
  objectiveId: string;
  title: string;
  description: string;
}): Promise<GovernanceActionResult> {
  try {
    const actingUser = await requireActingUser();
    await withTenantContext(db, actingUser.orgId, (tx) =>
      updateObjective(
        tx,
        { organizationId: actingUser.orgId, userId: actingUser.id },
        params.objectiveId,
        { title: params.title, description: params.description || null },
        makeObjectiveScopeVerifier(tx),
      ),
    );
    revalidateGovernance(params.routeTeamId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function deleteObjectiveAction(params: {
  routeTeamId: string;
  objectiveId: string;
}): Promise<GovernanceActionResult> {
  try {
    const actingUser = await requireActingUser();
    await withTenantContext(db, actingUser.orgId, (tx) =>
      deleteObjective(tx, { organizationId: actingUser.orgId, userId: actingUser.id }, params.objectiveId),
    );
    revalidateGovernance(params.routeTeamId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}
