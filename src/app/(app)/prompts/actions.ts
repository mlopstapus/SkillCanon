"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  assignSkillToProject,
  createPrompt,
  deprecatePrompt,
  forkSkill,
  getPrompt,
  getSkillChainRun,
  listSkillChainRuns,
  listVersions,
  publishVersion,
  reactivatePrompt,
  rollbackPrompt,
  subscribeSkill,
  unassignSkillFromProject,
  unsubscribeSkill,
  type ChainStep,
  type SubscriberType,
} from "@/bcs/prompt-registry";
import { authenticateSession } from "@/bcs/identity-access";
import { authDb, db, withTenantContext } from "@/shared/db";

export type PromptActionResult = { ok: true } | { ok: false; error: string };

async function requireActingUser() {
  const cookieHeader = (await headers()).get("cookie");
  const user = await authenticateSession(authDb, cookieHeader);
  if (!user) {
    throw new Error("Not signed in.");
  }
  return user;
}

/** Next free "vN" label for a prompt, following the mockup's own numbering scheme. */
function nextVersionLabel(versions: Array<{ version: string }>): string {
  const numbers = versions
    .map((v) => /^v(\d+)$/.exec(v.version)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number);
  const next = numbers.length ? Math.max(...numbers) + 1 : 1;
  return `v${next}`;
}

export async function createPromptAction(params: {
  name: string;
  description?: string;
  systemTemplate?: string;
  userTemplate?: string;
  tags?: string[];
}): Promise<PromptActionResult> {
  try {
    const actingUser = await requireActingUser();
    const actor = { organizationId: actingUser.orgId, userId: actingUser.id };
    await withTenantContext(db, actingUser.orgId, async (tx) => {
      await createPrompt(tx, actor, {
        organizationId: actingUser.orgId,
        name: params.name,
        description: params.description ?? null,
      });
      await publishVersion(tx, actor, {
        promptName: params.name,
        organizationId: actingUser.orgId,
        version: "v1",
        systemTemplate: params.systemTemplate ?? null,
        userTemplate: params.userTemplate ?? null,
        tags: params.tags ?? [],
      });
    });
    revalidatePath("/prompts");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export async function deprecatePromptAction(promptName: string): Promise<PromptActionResult> {
  try {
    const actingUser = await requireActingUser();
    await withTenantContext(db, actingUser.orgId, (tx) =>
      deprecatePrompt(tx, { organizationId: actingUser.orgId, userId: actingUser.id }, promptName),
    );
    revalidatePath("/prompts");
    revalidatePath(`/prompts/${promptName}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export async function reactivatePromptAction(promptName: string): Promise<PromptActionResult> {
  try {
    const actingUser = await requireActingUser();
    await withTenantContext(db, actingUser.orgId, (tx) =>
      reactivatePrompt(tx, { organizationId: actingUser.orgId, userId: actingUser.id }, promptName),
    );
    revalidatePath("/prompts");
    revalidatePath(`/prompts/${promptName}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export async function publishVersionAction(params: {
  promptName: string;
  systemTemplate?: string;
  userTemplate?: string;
  steps?: ChainStep[];
  tags?: string[];
  setActive?: boolean;
}): Promise<PromptActionResult> {
  try {
    const actingUser = await requireActingUser();
    const actor = { organizationId: actingUser.orgId, userId: actingUser.id };
    await withTenantContext(db, actingUser.orgId, async (tx) => {
      const [prompt, versions] = await Promise.all([
        getPrompt(tx, actor, params.promptName),
        listVersions(tx, actor, params.promptName),
      ]);
      const previouslyActive = versions.find((v) => v.id === prompt?.activeVersionId);
      const version = nextVersionLabel(versions);
      // Exactly one of template content or chain steps — never both (FR-001,
      // PDR-017); publishVersion itself enforces this, this action just
      // passes through whichever shape the caller provided.
      await publishVersion(tx, actor, {
        promptName: params.promptName,
        organizationId: actingUser.orgId,
        version,
        ...(params.steps
          ? { steps: params.steps }
          : { systemTemplate: params.systemTemplate ?? null, userTemplate: params.userTemplate ?? null }),
        tags: params.tags ?? [],
      });
      // publishVersion always advances active_version_id — roll back to
      // whatever was active immediately beforehand when the caller opted
      // out of activating the new version immediately.
      if (params.setActive === false && previouslyActive) {
        await rollbackPrompt(tx, actor, params.promptName, previouslyActive.version);
      }
    });
    revalidatePath(`/prompts/${params.promptName}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export async function rollbackPromptAction(
  promptName: string,
  targetVersion: string,
): Promise<PromptActionResult> {
  try {
    const actingUser = await requireActingUser();
    await withTenantContext(db, actingUser.orgId, (tx) =>
      rollbackPrompt(
        tx,
        { organizationId: actingUser.orgId, userId: actingUser.id },
        promptName,
        targetVersion,
      ),
    );
    revalidatePath(`/prompts/${promptName}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export async function subscribeSkillAction(
  sourceSkillId: string,
  promptName: string,
  params: { subscriberType: SubscriberType; subscriberId: string },
): Promise<PromptActionResult> {
  try {
    const actingUser = await requireActingUser();
    await withTenantContext(db, actingUser.orgId, (tx) => subscribeSkill(tx, actingUser, sourceSkillId, params));
    revalidatePath(`/prompts/${promptName}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export async function unsubscribeSkillAction(
  subscriptionId: string,
  promptName: string,
): Promise<PromptActionResult> {
  try {
    const actingUser = await requireActingUser();
    await withTenantContext(db, actingUser.orgId, (tx) => unsubscribeSkill(tx, actingUser, subscriptionId));
    revalidatePath(`/prompts/${promptName}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export async function forkSkillAction(
  sourceSkillId: string,
  params: { ownerType: "user" | "team"; ownerId: string },
): Promise<PromptActionResult> {
  try {
    const actingUser = await requireActingUser();
    await withTenantContext(db, actingUser.orgId, (tx) => forkSkill(tx, actingUser, sourceSkillId, params));
    revalidatePath("/prompts");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

/**
 * Convenience wrapper over `forkSkillAction` for the common case (FR-016):
 * the acting user forks their own independent copy, with no ownership
 * picker needed — resolves `ownerId` from the session instead of a caller-
 * supplied value.
 */
export async function forkSkillForSelfAction(sourceSkillId: string): Promise<PromptActionResult> {
  try {
    const actingUser = await requireActingUser();
    await withTenantContext(db, actingUser.orgId, (tx) =>
      forkSkill(tx, actingUser, sourceSkillId, { ownerType: "user", ownerId: actingUser.id }),
    );
    revalidatePath("/prompts");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export async function assignSkillToProjectAction(
  projectId: string,
  skillId: string,
  requirement: "required" | "optional",
  promptName?: string,
): Promise<PromptActionResult> {
  try {
    const actingUser = await requireActingUser();
    await withTenantContext(db, actingUser.orgId, (tx) =>
      assignSkillToProject(tx, actingUser, projectId, skillId, { requirement }),
    );
    revalidatePath(`/projects/${projectId}`);
    if (promptName) revalidatePath(`/prompts/${promptName}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export async function unassignSkillFromProjectAction(
  projectId: string,
  skillId: string,
  promptName?: string,
): Promise<PromptActionResult> {
  try {
    const actingUser = await requireActingUser();
    await withTenantContext(db, actingUser.orgId, (tx) => unassignSkillFromProject(tx, actingUser, projectId, skillId));
    revalidatePath(`/projects/${projectId}`);
    if (promptName) revalidatePath(`/prompts/${promptName}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export type ListSkillChainRunsActionResult =
  | { ok: true; items: Awaited<ReturnType<typeof listSkillChainRuns>>["items"]; page: number; pageSize: number; total: number }
  | { ok: false; error: string };

/**
 * Read-only (027-skill-chain-views-ui) — pages the Run History tab without
 * a full route navigation (research.md: this page's other tabs are already
 * local client state, so a read action keeps this one consistent with its
 * siblings rather than introducing URL-driven paging for only this tab).
 */
export async function listSkillChainRunsAction(
  promptId: string,
  page: number,
): Promise<ListSkillChainRunsActionResult> {
  try {
    const actingUser = await requireActingUser();
    const result = await withTenantContext(db, actingUser.orgId, (tx) =>
      listSkillChainRuns(tx, actingUser.orgId, promptId, { page }),
    );
    return { ok: true, ...result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

type SkillChainRunDetail = NonNullable<Awaited<ReturnType<typeof getSkillChainRun>>>;

export type GetSkillChainRunActionResult =
  | ({ ok: true } & SkillChainRunDetail)
  | { ok: false; error: string };

/**
 * Read-only (027-skill-chain-views-ui) — fetches one run's full step detail
 * lazily, the first time its row is expanded in the Run History tab (never
 * prefetched for every row on the page — research.md).
 */
export async function getSkillChainRunAction(runId: string): Promise<GetSkillChainRunActionResult> {
  try {
    const actingUser = await requireActingUser();
    const result = await withTenantContext(db, actingUser.orgId, (tx) =>
      getSkillChainRun(tx, actingUser.orgId, runId),
    );
    if (!result) {
      return { ok: false, error: "Run not found." };
    }
    return { ok: true, run: result.run, steps: result.steps };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}
