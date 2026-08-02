# Quickstart: Skill Chains

Validates the feature end-to-end at the bounded-context layer (no HTTP/UI exists yet — that's `backlog/006-prompt-registry/010-skill-chain-views-ui.md` and `008-distribution`). Run this after `/speckit-implement` completes, or use it as the shape for the feature's own integration tests.

## Prerequisites

- Local Postgres reachable (or let Testcontainers provision an ephemeral one — the same mechanism `pnpm test` already uses).
- Migrations applied: `pnpm db:migrate` (includes the two new migrations this feature adds).

## Setup: two ordinary template skills + one chain skill

```ts
import { withTenantContext } from "@/shared/db/tenant-context";
import { createPrompt, publishVersion } from "@/bcs/prompt-registry";

await withTenantContext(db, organizationId, async (tx) => {
  // Two plain template skills to chain together. A chain run's own
  // input is always just the dependsOn envelope map from earlier steps —
  // there is no separate, caller-supplied "run input" anywhere in this
  // API surface, so step 1 (which nothing can precede) never references
  // any variable at all. `default("", true)` guards against a failed
  // dependency's `.output` being `null` (the sandboxed Nunjucks renderer
  // rejects outputting null/undefined directly).
  await createPrompt(tx, actor, { organizationId, name: "draft-outline" });
  await publishVersion(tx, actor, {
    organizationId, promptName: "draft-outline", version: "1.0.0",
    userTemplate: "Draft a one-paragraph outline for a blog post about testing.",
  });

  await createPrompt(tx, actor, { organizationId, name: "expand-outline" });
  await publishVersion(tx, actor, {
    organizationId, promptName: "expand-outline", version: "1.0.0",
    userTemplate: "Expand this outline into full prose. Prior step: {{ step1.output | default(\"\", true) }}",
  });

  // The chain itself.
  await createPrompt(tx, actor, { organizationId, name: "write-article" });
  await publishVersion(tx, actor, {
    organizationId, promptName: "write-article", version: "1.0.0",
    steps: [
      { id: "step1", promptName: "draft-outline", dependsOn: [] },
      { id: "step2", promptName: "expand-outline", dependsOn: ["step1"] },
    ],
  });
});
```

## Run: drive the chain to completion

```ts
import { startSkillChainRun, advanceSkillChainRun } from "@/bcs/prompt-registry";

await withTenantContext(db, organizationId, async (tx) => {
  const started = await startSkillChainRun(tx, actor, "write-article");
  // started: { runId, step: { stepId: "step1", stepIndex: 0, promptName: "draft-outline", userMessage: "Draft a one-paragraph outline for a blog post about testing.", ... } }

  const afterStep1 = await advanceSkillChainRun(tx, actor, started.runId, {
    stepIndex: 0,
    status: "success",
    output: "1. Intro 2. Body 3. Conclusion",
  });
  // afterStep1: { step: { stepId: "step2", ..., userMessage: "Expand this outline into full prose. Prior step: 1. Intro 2. Body 3. Conclusion" } }

  const afterStep2 = await advanceSkillChainRun(tx, actor, started.runId, {
    stepIndex: 1,
    status: "success",
    output: "<the caller's real generated article text>",
  });
  // afterStep2: { done: true }
});
```

**Expected outcome**: `getSkillChainRun(db, organizationId, started.runId)` returns `{ run: { status: "completed", ... }, steps: [...] }` with both steps' full resolved content and self-reported outcomes.

## Verify: failure isolation

Same setup, but report step 1 as `"error"` instead:

```ts
const afterFailedStep1 = await advanceSkillChainRun(tx, actor, started.runId, {
  stepIndex: 0,
  status: "error",
  error: "model call timed out",
});
// afterFailedStep1.step.userMessage contains "Expand this outline into full prose. Prior step: " followed by
// nothing (the default("", true) guard) — never the string "null", never stale or fabricated data.
```

The final `getSkillChainRun` read shows `run.status === "failed"` even though the run walked all the way to its last step.

## Verify: invalid chain rejected before any run exists

```ts
await createPrompt(tx, actor, { organizationId, name: "broken-chain" });
await publishVersion(tx, actor, {
  organizationId, promptName: "broken-chain", version: "1.0.0",
  steps: [{ id: "step1", promptName: "draft-outline", dependsOn: ["step1"] }], // self-reference
});

await expect(startSkillChainRun(tx, actor, "broken-chain")).rejects.toThrow(InvalidChainDependencyError);
// No skill_chain_runs row exists for "broken-chain" afterward — verify via listSkillChainRuns.
```

## Verify: cross-org denial

Repeat the "Run" section under `organizationId: orgA`, then attempt `getSkillChainRun(db, orgB, runIdFromOrgA)` — must return `null`, not the row and not a distinguishing error.

## Verify: sharing inherits for free

`subscribeSkill(db, actingUser, chainPromptId, { subscriberType: "team", subscriberId: teamBId })`, then as a member of Team B, `startSkillChainRun(db, teamBActor, "write-article")` — must succeed with zero additional setup, proving the "inherits sharing for free" claim (spec User Story 3 / SC-003).
