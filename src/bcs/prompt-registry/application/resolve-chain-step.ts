import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { ExpansionResult } from "../domain/expansion";
import type { ChainStep } from "../domain/skill-chain";
import { ChainStepResolutionFailedError } from "../domain/skill-chain";
import { expand, fetchExpandableVersion } from "./expand";

type Tx = PostgresJsDatabase<Record<string, never>>;

/**
 * Resolves one chain step's content through this same BC's `expand()`
 * (CONTRACT.md — same-BC, never cross-BC), pinned to the *exact* version
 * `expand()` will actually use, resolved once up front so the persisted
 * `skill_chain_run_steps.prompt_version` is always concrete (never left
 * "unspecified" even for a step that didn't pin one — data-model.md).
 *
 * A step is invoked exactly like any other `expand()` call — no per-step
 * dependency data is auto-substituted into its content
 * (032-skill-file-format-refactor: `expand()` has no `input` parameter at
 * all, for any caller, including chain steps). A step's own `dependsOn`
 * metadata and each prior step's caller-reported output remain visible to
 * the *caller* (via the run's step list) — relaying that into a later
 * step's context, if needed, is the caller's responsibility, matching how
 * a top-level skill invocation is never handed structured arguments either.
 *
 * Any failure here — the target not found, deprecated, itself a chain
 * (nested chains are unsupported; a chain-kind target is rejected by
 * `expand()` the same as a nonexistent one), or any other `expand()`
 * failure — is a **system-side resolution failure** (FR-011), distinct
 * from a caller-reported step failure: it always surfaces as
 * `ChainStepResolutionFailedError`, never a normal resolution.
 */
export async function resolveChainStep(
  tx: Tx,
  organizationId: string,
  actorUserId: string,
  step: ChainStep,
): Promise<{ resolvedVersion: string; expansion: ExpansionResult }> {
  const versionRow = await fetchExpandableVersion(
    tx,
    organizationId,
    step.promptName,
    step.promptVersion,
  );
  if (!versionRow || versionRow.kind === "chain") {
    throw new ChainStepResolutionFailedError(
      step.id,
      step.promptName,
      new Error("Target skill/version could not be resolved (not found, deprecated, or itself a chain)."),
    );
  }

  try {
    const expansion = await expand(tx, {
      organizationId,
      promptName: step.promptName,
      userId: actorUserId,
      version: versionRow.version,
    });
    return { resolvedVersion: versionRow.version, expansion };
  } catch (cause) {
    throw new ChainStepResolutionFailedError(step.id, step.promptName, cause);
  }
}
