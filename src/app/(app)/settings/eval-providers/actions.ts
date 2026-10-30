"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { authenticateSession } from "@/bcs/identity-access";
import { removeEvalProvider, setEvalDefaultJudge, setEvalProvider, setEvalsEnabled } from "@/bcs/prompt-registry";
import { authDb, db, withTenantContext } from "@/shared/db";

export type EvalProviderActionResult = { ok: true } | { ok: false; error: string };

type Tx = Parameters<typeof setEvalProvider>[0];
type User = Parameters<typeof setEvalProvider>[1];

async function run(fn: (user: User, tx: Tx) => Promise<unknown>): Promise<EvalProviderActionResult> {
  try {
    const user = await authenticateSession(authDb, (await headers()).get("cookie"));
    if (!user) throw new Error("Not signed in.");
    await withTenantContext(db, user.orgId, (tx) => fn(user, tx));
    revalidatePath("/settings/eval-providers");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export async function saveProviderAction(p: { provider: string; apiKey?: string; models: string[] }) {
  return run((user, tx) => setEvalProvider(tx, user, p));
}
export async function removeProviderAction(provider: string) {
  return run((user, tx) => removeEvalProvider(tx, user, provider));
}
export async function setJudgeAction(defaultJudge: string | null) {
  return run((user, tx) => setEvalDefaultJudge(tx, user, defaultJudge));
}
export async function setEnabledAction(enabled: boolean) {
  return run((user, tx) => setEvalsEnabled(tx, user, enabled));
}
