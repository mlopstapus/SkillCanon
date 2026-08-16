"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  assignSkillToProject,
  createPrompt,
  deprecatePrompt,
  fetchExternalSkillSource,
  forkSkill,
  getPrompt,
  getSkillChainRun,
  listSkillChainRuns,
  listVersions,
  publishVersion,
  reactivatePrompt,
  rollbackPrompt,
  scanLocalSkillFolders,
  subscribeSkill,
  transferSkillOwnership,
  unassignSkillFromProject,
  unsubscribeSkill,
  type ChainStep,
  type ExternalSkillCandidate,
  type LocalSkillCandidate,
  type LocalSkillFileEntry,
  type LocalSkillInvalidFolder,
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

/**
 * Creates only the skill shell (032-skill-file-format-refactor, FR-018) —
 * no version is published here. The caller (`new-prompt-drawer.tsx`) hands
 * off to the same New Version file-bundle flow used for every later
 * version to author v1, rather than a separate template-entry form.
 */
export type FetchExternalSkillSourceResult =
  | { ok: true; source: string; skills: ExternalSkillCandidate[] }
  | { ok: false; error: string };

/**
 * Pure external read (013-skill-import-and-external-registries) — no DB
 * call, so no `withTenantContext` wrapper is needed. Still requires a
 * signed-in caller, same as every other action here.
 */
export async function fetchExternalSkillSourceAction(source: string): Promise<FetchExternalSkillSourceResult> {
  try {
    await requireActingUser();
    const result = await fetchExternalSkillSource(source);
    return { ok: true, ...result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export interface ImportExternalSkillsResult {
  imported: string[];
  failed: Array<{ name: string; error: string }>;
}

export type ImportExternalSkillsActionResult =
  | ({ ok: true } & ImportExternalSkillsResult)
  | { ok: false; error: string };

/**
 * Imports each selected external skill as its own independent
 * create-plus-publish operation (its own `withTenantContext` call, not one
 * shared transaction for the whole batch) so a single collision or
 * validation failure can't poison the Postgres transaction for every other
 * skill in the same import — see this repo's own notes on why a caught
 * unique-violation still aborts a shared tx. Ownership matches
 * `createPrompt`'s existing "always creates a user-owned skill" behavior
 * (FR-005) — no special-cased ownership path for imported skills.
 */
export async function importExternalSkillsAction(
  source: string,
  skills: ExternalSkillCandidate[],
): Promise<ImportExternalSkillsActionResult> {
  try {
    const actingUser = await requireActingUser();
    const actor = { organizationId: actingUser.orgId, userId: actingUser.id };
    const imported: string[] = [];
    const failed: Array<{ name: string; error: string }> = [];
    for (const skill of skills) {
      try {
        await withTenantContext(db, actingUser.orgId, async (tx) => {
          await createPrompt(tx, actor, {
            organizationId: actingUser.orgId,
            name: skill.name,
            description: skill.description || null,
            sourceUrl: source,
          });
          await publishVersion(tx, actor, {
            promptName: skill.name,
            organizationId: actingUser.orgId,
            version: "v1",
            mainFile: { content: skill.mainFile.content },
            supportingFiles: skill.supportingFiles,
            tags: [],
          });
        });
        imported.push(skill.name);
      } catch (err) {
        failed.push({ name: skill.name, error: err instanceof Error ? err.message : "Something went wrong." });
      }
    }
    if (imported.length > 0) {
      revalidatePath("/prompts");
    }
    return { ok: true, imported, failed };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export type ScanLocalSkillFoldersActionResult =
  | {
      ok: true;
      candidates: LocalSkillCandidate[];
      duplicateNames: string[];
      invalidFolders: LocalSkillInvalidFolder[];
    }
  | { ok: false; error: string };

/**
 * Local Folder Skill Upload (013-skill-import-and-external-registries/002,
 * spec 037-local-folder-skill-upload) — pure detection over already-read
 * local file entries (already narrowed client-side to candidate-directory
 * files only, FR-012). No DB call, so no `withTenantContext` wrapper, same
 * as `fetchExternalSkillSourceAction`'s existing precedent.
 */
export async function scanLocalSkillFoldersAction(
  entries: LocalSkillFileEntry[],
): Promise<ScanLocalSkillFoldersActionResult> {
  try {
    await requireActingUser();
    const result = scanLocalSkillFolders(entries);
    return {
      ok: true,
      candidates: result.candidates,
      duplicateNames: [...result.duplicateNames],
      invalidFolders: result.invalidFolders,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export interface ImportLocalSkillsResult {
  imported: string[];
  failed: Array<{ name: string; error: string }>;
}

export type ImportLocalSkillsActionResult =
  | ({ ok: true } & ImportLocalSkillsResult)
  | { ok: false; error: string };

/**
 * The per-skill create/publish/error-isolation loop lives here, separately
 * exported and taking the already-resolved actor as a plain parameter
 * (rather than calling `requireActingUser()`/`headers()` itself) so it can
 * be called directly from a Testcontainers-backed test with no Next.js
 * request context — `importLocalSkillsAction` below is a thin wrapper that
 * resolves the real caller and delegates. `dbOverride` exists for the same
 * reason (defaults to the real `db` singleton in production; a test passes
 * `testDb.appDb` instead — mirrors `withApiRoute`'s `deps.db` pattern for
 * REST routes, `src/shared/api/handler.ts`). One independent
 * `withTenantContext` transaction per skill, matching
 * `importExternalSkillsAction`'s existing pattern, so a single collision
 * or validation failure can't roll back the rest of the batch (FR-007) —
 * but unlike that sibling import path, no `sourceUrl` is ever set (FR-005;
 * this feature has no provenance concept).
 */
export async function runLocalSkillImportBatch(
  actingUser: Pick<Awaited<ReturnType<typeof requireActingUser>>, "id" | "orgId">,
  skills: LocalSkillCandidate[],
  dbOverride: typeof db = db,
): Promise<ImportLocalSkillsResult> {
  const actor = { organizationId: actingUser.orgId, userId: actingUser.id };
  const imported: string[] = [];
  const failed: Array<{ name: string; error: string }> = [];
  for (const skill of skills) {
    try {
      await withTenantContext(dbOverride, actingUser.orgId, async (tx) => {
        await createPrompt(tx, actor, {
          organizationId: actingUser.orgId,
          name: skill.name,
          description: skill.description || null,
        });
        await publishVersion(tx, actor, {
          promptName: skill.name,
          organizationId: actingUser.orgId,
          version: "v1",
          mainFile: { content: skill.mainFile.content },
          supportingFiles: skill.supportingFiles,
          tags: [],
        });
      });
      imported.push(skill.name);
    } catch (err) {
      failed.push({ name: skill.name, error: err instanceof Error ? err.message : "Something went wrong." });
    }
  }
  return { imported, failed };
}

export async function importLocalSkillsAction(skills: LocalSkillCandidate[]): Promise<ImportLocalSkillsActionResult> {
  try {
    const actingUser = await requireActingUser();
    const result = await runLocalSkillImportBatch(actingUser, skills);
    if (result.imported.length > 0) {
      revalidatePath("/prompts");
    }
    return { ok: true, ...result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export async function createPromptAction(params: {
  name: string;
  description?: string;
  tags?: string[];
}): Promise<PromptActionResult> {
  try {
    const actingUser = await requireActingUser();
    const actor = { organizationId: actingUser.orgId, userId: actingUser.id };
    await withTenantContext(db, actingUser.orgId, (tx) =>
      createPrompt(tx, actor, {
        organizationId: actingUser.orgId,
        name: params.name,
        description: params.description ?? null,
      }),
    );
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
  mainFile?: { content: string };
  supportingFiles?: Array<{ name: string; content: string }>;
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
      // Exactly one of a main file or chain steps — never both (FR-001/
      // FR-004, PDR-017); publishVersion itself enforces this, this action
      // just passes through whichever shape the caller provided.
      await publishVersion(tx, actor, {
        promptName: params.promptName,
        organizationId: actingUser.orgId,
        version,
        ...(params.steps
          ? { steps: params.steps }
          : { mainFile: params.mainFile, supportingFiles: params.supportingFiles }),
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
  params: { ownerType: "user" | "team"; ownerId: string; name: string; description?: string },
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
 * the acting user copies into their own ownership, with no ownership
 * picker needed — resolves `ownerId` from the session. Creates only the
 * new skill's shell (name/description); its first version is authored
 * separately through `publishVersionAction`, prefilled from the source
 * (2026-08-15 design doc).
 */
export async function forkSkillForSelfAction(
  sourceSkillId: string,
  values: { name: string; description?: string },
): Promise<PromptActionResult> {
  try {
    const actingUser = await requireActingUser();
    await withTenantContext(db, actingUser.orgId, (tx) =>
      forkSkill(tx, actingUser, sourceSkillId, { ownerType: "user", ownerId: actingUser.id, ...values }),
    );
    revalidatePath("/prompts");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export async function transferSkillOwnershipAction(
  skillId: string,
  promptName: string,
  params: { newOwnerType: "user" | "team"; newOwnerId: string },
): Promise<PromptActionResult> {
  try {
    const actingUser = await requireActingUser();
    await withTenantContext(db, actingUser.orgId, (tx) =>
      transferSkillOwnership(tx, actingUser, skillId, params),
    );
    revalidatePath("/prompts");
    revalidatePath(`/prompts/${promptName}`);
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
