"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { authenticateSession, createApiKey, revokeApiKey } from "@/bcs/identity-access";
import { authDb, db, withTenantContext } from "@/shared/db";

async function requireActingUser() {
  const cookieHeader = (await headers()).get("cookie");
  const user = await authenticateSession(authDb, cookieHeader);
  if (!user) {
    throw new Error("Not signed in.");
  }
  return user;
}

export type CreateApiKeyResult =
  | { ok: true; rawKey: string }
  | { ok: false; error: string };

export async function createApiKeyAction(params: {
  name: string;
  scopes: string[];
  expiresInDays?: number;
}): Promise<CreateApiKeyResult> {
  try {
    const actingUser = await requireActingUser();
    const expiresAt = params.expiresInDays
      ? new Date(Date.now() + params.expiresInDays * 24 * 60 * 60 * 1000)
      : undefined;
    const { rawKey } = await withTenantContext(db, actingUser.orgId, (tx) =>
      createApiKey(tx, actingUser, { name: params.name, scopes: params.scopes, expiresAt }),
    );
    revalidatePath("/settings/api-keys");
    return { ok: true, rawKey };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export type ApiKeyActionResult = { ok: true } | { ok: false; error: string };

export async function revokeApiKeyAction(params: {
  keyId: string;
}): Promise<ApiKeyActionResult> {
  try {
    const actingUser = await requireActingUser();
    await withTenantContext(db, actingUser.orgId, (tx) =>
      revokeApiKey(tx, actingUser, params.keyId),
    );
    revalidatePath("/settings/api-keys");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}
