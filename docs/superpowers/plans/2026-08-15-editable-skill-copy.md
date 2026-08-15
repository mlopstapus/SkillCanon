# Editable "Make a copy" (skill fork) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the silent, hash-named "Make a copy" fork with a two-drawer flow — enter a real name/description, then edit the copied content — for skills you don't own, and hide the button entirely for skills you do own.

**Architecture:** `forkSkill` becomes shell-only (creates the new `Prompt` row with a caller-supplied name/description and `forkedFromSkillId` lineage, no version copying) — content authoring moves entirely to the existing `publishVersion` path via a second, source-prefilled `NewVersionDrawer` invocation. A new `CopySkillDrawer` collects the name/description. `PromptDetailData` gains `isOwnSkill` to gate the button.

**Tech Stack:** Next.js Server Actions, Drizzle/Postgres (Testcontainers-backed tests), React (Vitest + `renderToStaticMarkup` + axe-core), Zod (REST route validation).

**Design doc:** `docs/superpowers/specs/2026-08-15-editable-skill-copy-design.md`

---

## File Structure

| File | Change |
|---|---|
| `src/bcs/prompt-registry/domain/subscription.ts` | Modify — `ForkSkillParams` gains `name`/`description` |
| `src/bcs/prompt-registry/application/fork-skill.ts` | Modify — shell-only, no version/file copying, duplicate-name check |
| `src/bcs/prompt-registry/application/fork-skill.test.ts` | Modify — update existing assertions, add 2 new tests |
| `src/app/api/skills/[name]/fork/route.ts` | Modify — `forkSchema` gains `name`/`description` |
| `src/app/api/skills/[name]/fork/route.test.ts` | Modify — request bodies now include `name` |
| `src/app/(app)/prompts/[name]/prompt-detail-view.tsx` | Modify — `isOwnSkill` field, conditional button |
| `src/app/(app)/prompts/[name]/prompt-detail-view.test.tsx` | Modify — `baseData.isOwnSkill`, new hide-button test |
| `src/app/(app)/prompts/[name]/page.tsx` | Modify — compute and pass `isOwnSkill` |
| `src/app/(app)/prompts/[name]/copy-skill-drawer.tsx` | Create — Step 1 drawer (name/description) |
| `src/app/(app)/prompts/[name]/copy-skill-drawer.test.tsx` | Create — structural + axe test |
| `src/app/(app)/prompts/actions.ts` | Modify — `forkSkillForSelfAction`/`forkSkillAction` take `name`/`description` |
| `src/app/(app)/prompts/[name]/prompt-detail.tsx` | Modify — two-drawer flow wiring |
| `backlog/009-billing-entitlements/004-entitlement-enforcement-integration.md` | Modify — track prompt-registry's entitlement-gating gap |

---

### Task 1: Domain type — `ForkSkillParams` gains name/description

**Files:**
- Modify: `src/bcs/prompt-registry/domain/subscription.ts:33-36`

- [ ] **Step 1: Update `ForkSkillParams`**

Change:

```ts
export interface ForkSkillParams {
  ownerType: OwnerType;
  ownerId: string;
}
```

to:

```ts
export interface ForkSkillParams {
  ownerType: OwnerType;
  ownerId: string;
  /** Caller-supplied — the copy's own name, edited before creation rather than auto-generated. */
  name: string;
  description?: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/bcs/prompt-registry/domain/subscription.ts
git commit -m "feat: add name/description to ForkSkillParams"
```

---

### Task 2: `forkSkill` becomes shell-only (backend, TDD)

This is the core behavior change: `forkSkill` stops copying the source's version/files and stops auto-generating a hash-suffixed name. It creates only the new `Prompt` row (caller-supplied name/description, `forkedFromSkillId` set, `activeVersionId: null`), still enforcing every existing validation rule (org boundary, self-fork rejection, team-admin authorization) plus a new duplicate-name check.

`ForkSkillParams` now requires `name` (Task 1), so every other file in the repo that calls `forkSkill` directly also needs fixing — grepping `forkSkill(` across `src/` turns up 6 more files beyond `fork-skill.test.ts` itself. Five just need a `name` added to an object literal; one (`skill-chain-sharing.test.ts`) has a real behavioral dependency on the old auto-copy behavior and needs restructuring, not just a field addition. All of it is covered below.

**Files:**
- Modify: `src/bcs/prompt-registry/application/fork-skill.ts`
- Test: `src/bcs/prompt-registry/application/fork-skill.test.ts`
- Test: `src/bcs/prompt-registry/application/count-forks-of-skill.test.ts`
- Test: `src/bcs/prompt-registry/application/personal-to-team-sharing.test.ts`
- Test: `src/bcs/prompt-registry/application/tenant-isolation.test.ts`
- Test: `src/bcs/prompt-registry/application/skill-chain-sharing.test.ts`
- Test: `src/app/api/projects/[projectId]/skills/route.test.ts`
- Test: `src/app/api/projects/[projectId]/skills/[skillId]/route.test.ts`

- [ ] **Step 1: Rewrite the test file for shell-only behavior**

Replace the full contents of `src/bcs/prompt-registry/application/fork-skill.test.ts` with:

```ts
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { DuplicatePromptNameError } from "../domain/prompt";
import {
  CannotForkOwnSkillError,
  CrossOrgSubscriberError,
  SourceSkillNotFoundError,
  SubscriberNotAuthorizedError,
} from "../domain/subscription";
import { forkSkill } from "./fork-skill";
import { getPromptById } from "./get-prompt-by-id";
import { publishVersion } from "./publish-version";
import {
  createTestSkillOwnedByUser,
  makeSubscriptionFixtureOrg,
  queryPromptRows,
  querySubscriptionAuditEvents,
} from "./subscription-test-helpers";

describe("forkSkill", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("creates a new, independent skill shell with the caller-supplied name/description and a lineage pointer, plus an audit event — no content copied (shell-only, superseding 020-prompt-sharing's original auto-copy)", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByUser(
      testDb,
      fixture.organizationId,
      fixture.userA.id,
      "fork-source",
    );
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      publishVersion(tx, { organizationId: fixture.organizationId, userId: fixture.userA.id }, {
        organizationId: fixture.organizationId,
        promptName: "fork-source",
        version: "v1",
        mainFile: { content: "Be helpful." },
        tags: ["a"],
      }),
    );

    const fork = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      forkSkill(
        tx,
        fixture.userB,
        source.id,
        { ownerType: "user", ownerId: fixture.userB.id, name: "fork-target", description: "My copy" },
        { transport: "api", sourceIp: "10.0.0.2" },
      ),
    );

    expect(fork.id).not.toBe(source.id);
    expect(fork.name).toBe("fork-target");
    expect(fork.description).toBe("My copy");
    expect(fork.ownerType).toBe("user");
    expect(fork.ownerId).toBe(fixture.userB.id);
    expect(fork.forkedFromSkillId).toBe(source.id);
    // Shell-only: content authoring happens separately through
    // publishVersion (the New Version drawer's own submit), not copied
    // automatically here anymore.
    expect(fork.activeVersionId).toBeNull();

    const events = await querySubscriptionAuditEvents(
      testDb,
      sql`action = 'skill.forked' and resource_id = ${fork.id}`,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.transport).toBe("api");
  });

  it("rejects forking into a name that already exists in the organization", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByUser(testDb, fixture.organizationId, fixture.userA.id);
    await createTestSkillOwnedByUser(testDb, fixture.organizationId, fixture.userB.id, "taken-name");

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        forkSkill(tx, fixture.userB, source.id, {
          ownerType: "user",
          ownerId: fixture.userB.id,
          name: "taken-name",
        }),
      ),
    ).rejects.toBeInstanceOf(DuplicatePromptNameError);
  });

  it("forks a skill into a team via its owner_id admin", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByUser(testDb, fixture.organizationId, fixture.userA.id);

    const fork = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      forkSkill(tx, fixture.team1Owner, source.id, {
        ownerType: "team",
        ownerId: fixture.team1Id,
        name: "team-fork-target",
      }),
    );

    expect(fork.ownerType).toBe("team");
    expect(fork.ownerId).toBe(fixture.team1Id);
  });

  it("rejects a team-fork attempt from a non-admin, non-owner member", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByUser(testDb, fixture.organizationId, fixture.userA.id);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        forkSkill(tx, fixture.userB, source.id, {
          ownerType: "team",
          ownerId: fixture.team1Id,
          name: "unauthorized-team-fork",
        }),
      ),
    ).rejects.toBeInstanceOf(SubscriberNotAuthorizedError);
  });

  it("rejects a cross-org fork attempt", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByUser(testDb, fixture.organizationId, fixture.userA.id);

    await expect(
      withTenantContext(testDb.appDb, fixture.otherOrgId, (tx) =>
        forkSkill(tx, fixture.otherOrgUser, source.id, {
          ownerType: "user",
          ownerId: fixture.otherOrgUser.id,
          name: "cross-org-fork",
        }),
      ),
    ).rejects.toBeInstanceOf(SourceSkillNotFoundError);

    const rows = await queryPromptRows(testDb, sql`forked_from_skill_id = ${source.id}`);
    expect(rows).toHaveLength(0);
  });

  it("rejects a team owner id belonging to a different organization", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByUser(testDb, fixture.organizationId, fixture.userA.id);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        forkSkill(tx, fixture.orgAdmin, source.id, {
          ownerType: "team",
          ownerId: fixture.otherOrgTeamId,
          name: "cross-org-team-fork",
        }),
      ),
    ).rejects.toBeInstanceOf(CrossOrgSubscriberError);
  });

  it("rejects forking a skill into an owner that already owns it (FR-021)", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByUser(testDb, fixture.organizationId, fixture.userA.id);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        forkSkill(tx, fixture.userA, source.id, {
          ownerType: "user",
          ownerId: fixture.userA.id,
          name: "self-fork-attempt",
        }),
      ),
    ).rejects.toBeInstanceOf(CannotForkOwnSkillError);
  });

  it("keeps the fork independent from later publishes on the source, once the fork has its own version", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByUser(
      testDb,
      fixture.organizationId,
      fixture.userA.id,
      "independence-source",
    );
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      publishVersion(tx, { organizationId: fixture.organizationId, userId: fixture.userA.id }, {
        organizationId: fixture.organizationId,
        promptName: "independence-source",
        version: "v1",
        mainFile: { content: "content" },
      }),
    );

    const fork = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      forkSkill(tx, fixture.userB, source.id, {
        ownerType: "user",
        ownerId: fixture.userB.id,
        name: "independence-fork",
      }),
    );
    // Mirrors the real Step 2 New Version flow — forkSkill itself no
    // longer copies content, so give the fork its own first version here.
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      publishVersion(tx, { organizationId: fixture.organizationId, userId: fixture.userB.id }, {
        organizationId: fixture.organizationId,
        promptName: fork.name,
        version: "v1",
        mainFile: { content: "fork's own content" },
      }),
    );
    const forkAfterOwnPublish = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      getPromptById(tx, fixture.organizationId, fork.id),
    );
    const forkVersionAfterOwnPublish = forkAfterOwnPublish?.activeVersionId;

    // Publish a new version on the source — the fork must be unaffected.
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      publishVersion(tx, { organizationId: fixture.organizationId, userId: fixture.userA.id }, {
        organizationId: fixture.organizationId,
        promptName: "independence-source",
        version: "v2",
        mainFile: { content: "content" },
      }),
    );

    const forkAfter = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      getPromptById(tx, fixture.organizationId, fork.id),
    );
    expect(forkAfter?.activeVersionId).toBe(forkVersionAfterOwnPublish);
  });

  it("keeps the source independent from later publishes on the fork", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const source = await createTestSkillOwnedByUser(
      testDb,
      fixture.organizationId,
      fixture.userA.id,
      "reverse-independence-source",
    );
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      publishVersion(tx, { organizationId: fixture.organizationId, userId: fixture.userA.id }, {
        organizationId: fixture.organizationId,
        promptName: "reverse-independence-source",
        version: "v1",
        mainFile: { content: "content" },
      }),
    );

    const fork = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      forkSkill(tx, fixture.userB, source.id, {
        ownerType: "user",
        ownerId: fixture.userB.id,
        name: "reverse-independence-fork",
      }),
    );

    const sourceBefore = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      getPromptById(tx, fixture.organizationId, source.id),
    );

    // Publish the fork's first version — the source must be unaffected.
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      publishVersion(tx, { organizationId: fixture.organizationId, userId: fixture.userB.id }, {
        organizationId: fixture.organizationId,
        promptName: fork.name,
        version: "v1",
        mainFile: { content: "content" },
      }),
    );

    const sourceAfter = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      getPromptById(tx, fixture.organizationId, source.id),
    );
    expect(sourceAfter?.activeVersionId).toBe(sourceBefore?.activeVersionId);
  });

  it("sets forkedFromSkillId to the immediate source when forking a fork, not the original root", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    const root = await createTestSkillOwnedByUser(testDb, fixture.organizationId, fixture.userA.id);

    const firstFork = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      forkSkill(tx, fixture.userB, root.id, {
        ownerType: "user",
        ownerId: fixture.userB.id,
        name: "first-fork",
      }),
    );
    expect(firstFork.forkedFromSkillId).toBe(root.id);

    const secondFork = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      forkSkill(tx, fixture.team1Owner, firstFork.id, {
        ownerType: "team",
        ownerId: fixture.team1Id,
        name: "second-fork",
      }),
    );
    expect(secondFork.forkedFromSkillId).toBe(firstFork.id);
    expect(secondFork.forkedFromSkillId).not.toBe(root.id);
  });
});
```

- [ ] **Step 2: Fix the other 6 call sites across the repo that construct `ForkSkillParams` literals**

`ForkSkillParams` now requires `name` (Task 1) — every other test file that calls `forkSkill` directly needs a `name` added, or it'll fail a NOT NULL constraint once Task 2's Step 4 lands. Grep confirms exactly these 6 files, each with the call site(s) shown:

In `src/bcs/prompt-registry/application/count-forks-of-skill.test.ts`, both calls (around lines 45 and 48) need a unique `name`:

```ts
      forkSkill(tx, fixture.userB, source.id, { ownerType: "user", ownerId: fixture.userB.id, name: "count-fork-user" }),
    );
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      forkSkill(tx, fixture.team1Owner, source.id, { ownerType: "team", ownerId: fixture.team1Id, name: "count-fork-team" }),
```

and the third call (around line 77):

```ts
      forkSkill(tx, fixtureB.userB, sourceB.id, { ownerType: "user", ownerId: fixtureB.userB.id, name: "count-fork-cross-org" }),
```

In `src/bcs/prompt-registry/application/personal-to-team-sharing.test.ts` (around line 30):

```ts
      forkSkill(tx, fixture.team1Owner, original.id, {
        ownerType: "team",
        ownerId: fixture.team1Id,
        name: "personal-to-team-fork",
      }),
```

In `src/bcs/prompt-registry/application/tenant-isolation.test.ts` (around line 208):

```ts
            forkSkill(tx, actingUser, id, { ownerType: "user", ownerId: actingUser.id, name: "tenant-isolation-fork" }),
```

In `src/app/api/projects/[projectId]/skills/route.test.ts` (around line 61):

```ts
      const teamSkill = await forkSkill(tx, adminActingUser, userSkill.id, {
        ownerType: "team",
        ownerId: seeded.teamId,
        name: `team-skill-${suffix}`,
      });
```

In `src/app/api/projects/[projectId]/skills/[skillId]/route.test.ts` (around line 57), the identical fix (this file has its own separate `seedProjectWithAssignedSkill` helper with the same shape):

```ts
      const teamSkill = await forkSkill(tx, adminActingUser, userSkill.id, {
        ownerType: "team",
        ownerId: seeded.teamId,
        name: `team-skill-${suffix}`,
      });
```

`src/bcs/prompt-registry/application/skill-chain-sharing.test.ts` needs a **behavioral** fix, not just a `name` addition — its "forking a chain creates an independent copy" test currently forks a chain-kind source and immediately asserts the fork is runnable (`startSkillChainRun` succeeds) with zero versions published on the fork, relying on `forkSkill`'s old auto-copy behavior. Since `forkSkill` is now shell-only, the fork needs its own chain version published first — mirroring what the real "Make a copy" flow's Step 2 (New Version drawer) would do. Replace (around lines 108-133):

```ts
    const fork = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      forkSkill(tx, fixture.userA, source.id, { ownerType: "user", ownerId: fixture.userA.id }),
    );

    // The fork itself is runnable, carrying over the chain's steps (kind/steps propagation).
    const forkRun = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      startSkillChainRun(tx, { organizationId: fixture.organizationId, userId: fixture.userA.id }, fork.name),
    );
    expect("step" in forkRun).toBe(true);

    // Publish a different (non-chain) version on the fork — the source is unaffected.
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      publishVersion(tx, { organizationId: fixture.organizationId, userId: fixture.userA.id }, {
        organizationId: fixture.organizationId,
        promptName: fork.name,
        version: "2.0.0",
        mainFile: { content: "no longer a chain on the fork" },
      }),
    );
```

with:

```ts
    const fork = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      forkSkill(tx, fixture.userA, source.id, {
        ownerType: "user",
        ownerId: fixture.userA.id,
        name: "fork-chain-target",
      }),
    );

    // forkSkill no longer copies content (shell-only) — give the fork its
    // own first version, mirroring the source's chain steps, exactly like
    // the real "Make a copy" flow's Step 2 (New Version drawer) would.
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      publishVersion(tx, { organizationId: fixture.organizationId, userId: fixture.userA.id }, {
        organizationId: fixture.organizationId,
        promptName: fork.name,
        version: "1.0.0",
        steps: CHAIN_STEPS,
      }),
    );

    // The fork is runnable once it has its own chain version.
    const forkRun = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      startSkillChainRun(tx, { organizationId: fixture.organizationId, userId: fixture.userA.id }, fork.name),
    );
    expect("step" in forkRun).toBe(true);

    // Publish a different (non-chain) version on the fork — the source is unaffected.
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      publishVersion(tx, { organizationId: fixture.organizationId, userId: fixture.userA.id }, {
        organizationId: fixture.organizationId,
        promptName: fork.name,
        version: "2.0.0",
        mainFile: { content: "no longer a chain on the fork" },
      }),
    );
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/bcs/prompt-registry/application/fork-skill.test.ts`

Expected: FAIL — the first test fails on `expect(fork.name).toBe("fork-target")` (old code still generates a hash-suffixed name) and `expect(fork.activeVersionId).toBeNull()` (old code still copies content); the "rejects forking into a name that already exists" test fails because old `forkSkill` never checks for a duplicate name; the two independence tests fail with a `DuplicatePromptVersionError` (old code already created "v1" for the fork via auto-copy, so this plan's explicit "v1" `publishVersion` call on the fork collides) or a related assertion mismatch.

Also run: `pnpm exec vitest run src/bcs/prompt-registry/application/count-forks-of-skill.test.ts src/bcs/prompt-registry/application/personal-to-team-sharing.test.ts src/bcs/prompt-registry/application/tenant-isolation.test.ts src/bcs/prompt-registry/application/skill-chain-sharing.test.ts "src/app/api/projects/[projectId]/skills/route.test.ts" "src/app/api/projects/[projectId]/skills/[skillId]/route.test.ts"`

Expected: these should mostly still PASS at this point (adding a `name` field to an object literal doesn't change old `forkSkill`'s behavior, since it never read `name` before), **except** `skill-chain-sharing.test.ts`, which should now FAIL differently — the old `forkSkill` still auto-copies content, so publishing "1.0.0" again on the fork right after forking it will hit `DuplicatePromptVersionError` (the fork already has a "1.0.0" from the old auto-copy). This confirms you're mid-transition; both fixes land together in Step 5 below.

- [ ] **Step 4: Rewrite `fork-skill.ts` to shell-only behavior**

Replace the full contents of `src/bcs/prompt-registry/application/fork-skill.ts` with:

```ts
import { randomUUID } from "node:crypto";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import type { UserSummary } from "@/bcs/identity-access";
import { withAudit } from "@/shared/db";
import { isUniqueViolation } from "@/shared/db/postgres-errors";
import { DuplicatePromptNameError } from "../domain/prompt";
import { CannotForkOwnSkillError, SourceSkillNotFoundError, type ForkSkillParams } from "../domain/subscription";
import { findPromptByOrgAndId, findPromptByOrgAndName, insertPrompt } from "../infrastructure/prompts-repo";
import { assertAuthorizedForOwner } from "./authorize-owner-action";

type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Creates a new, independent skill shell stamped with a permanent
 * `forkedFromSkillId` lineage pointer back to the source. Content (the
 * fork's own first version) is authored separately afterward through the
 * normal publishVersion path — exactly like a blank-created skill
 * (032-skill-file-format-refactor's FR-018) — never copied automatically
 * here. Superseded 020-prompt-sharing's original "copy the source's
 * current active version verbatim" behavior per the 2026-08-15 design doc:
 * a caller-editable copy needs an editable name up front and editable
 * content afterward, not an instant unrenamable duplicate.
 */
export async function forkSkill(
  db: Db,
  actingUser: UserSummary,
  sourceSkillId: string,
  params: ForkSkillParams,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
) {
  const source = await findPromptByOrgAndId(db, actingUser.orgId, sourceSkillId);
  if (!source) {
    throw new SourceSkillNotFoundError();
  }

  if (source.ownerType === params.ownerType && source.ownerId === params.ownerId) {
    throw new CannotForkOwnSkillError();
  }

  await assertAuthorizedForOwner(db, actingUser, params.ownerType, params.ownerId);

  if (await findPromptByOrgAndName(db, actingUser.orgId, params.name)) {
    throw new DuplicatePromptNameError(params.name);
  }

  const newPromptId = randomUUID();
  const promptValues = {
    id: newPromptId,
    organizationId: actingUser.orgId,
    name: params.name,
    description: params.description ?? null,
    isDeprecated: false,
    activeVersionId: null,
    ownerType: params.ownerType,
    ownerId: params.ownerId,
    forkedFromSkillId: sourceSkillId,
  };

  try {
    return await withAudit(
      db,
      (tx) => insertPrompt(tx, promptValues),
      (tx) =>
        record(tx, {
          organizationId: actingUser.orgId,
          actorUserId: actingUser.id,
          actorApiKeyId: null,
          action: "skill.forked",
          resourceType: "prompt",
          resourceId: newPromptId,
          before: null,
          after: promptValues,
          transport: auditContext.transport,
          sourceIp: auditContext.sourceIp ?? null,
        }),
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new DuplicatePromptNameError(params.name);
    }
    throw err;
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/bcs/prompt-registry/application/fork-skill.test.ts src/bcs/prompt-registry/application/count-forks-of-skill.test.ts src/bcs/prompt-registry/application/personal-to-team-sharing.test.ts src/bcs/prompt-registry/application/tenant-isolation.test.ts src/bcs/prompt-registry/application/skill-chain-sharing.test.ts "src/app/api/projects/[projectId]/skills/route.test.ts" "src/app/api/projects/[projectId]/skills/[skillId]/route.test.ts"`

Expected: PASS — all tests in all 7 files green.

- [ ] **Step 6: Commit**

```bash
git add src/bcs/prompt-registry/application/fork-skill.ts src/bcs/prompt-registry/application/fork-skill.test.ts src/bcs/prompt-registry/application/count-forks-of-skill.test.ts src/bcs/prompt-registry/application/personal-to-team-sharing.test.ts src/bcs/prompt-registry/application/tenant-isolation.test.ts src/bcs/prompt-registry/application/skill-chain-sharing.test.ts "src/app/api/projects/[projectId]/skills/route.test.ts" "src/app/api/projects/[projectId]/skills/[skillId]/route.test.ts"
git commit -m "feat: make forkSkill shell-only with caller-supplied name/description"
```

---

### Task 3: REST fork route accepts name/description (TDD)

The REST endpoint (`POST /api/skills/[name]/fork`) passes its request body straight through as `ForkSkillParams`. After Task 2, that type requires `name` — the route's Zod schema must be updated to accept and validate it, and every existing request-body fixture in its test that needs to reach `forkSkill`'s actual logic (not just an early auth/not-found short-circuit) needs a `name` added, since `forkSchema.parse()` strips unknown keys by default.

**Files:**
- Modify: `src/app/api/skills/[name]/fork/route.ts:12-15`
- Test: `src/app/api/skills/[name]/fork/route.test.ts`

- [ ] **Step 1: Add `name` to the request bodies of the 4 tests that must reach `forkSkill`**

In `src/app/api/skills/[name]/fork/route.test.ts`, update these 4 `POST` bodies (leave the "422 VALIDATION_FAILED for a missing ownerId" and "401 with no credential" tests unchanged — they never need to reach `forkSkill`):

Test `"forks a skill to a new owner and returns 201"` (around line 83):

```ts
        body: JSON.stringify({ ownerType: "user", ownerId: member.userId, name: `copy-of-${name}` }),
```

Test `"returns 404 SKILL_NOT_FOUND forking a nonexistent skill"` (around line 104):

```ts
        body: JSON.stringify({ ownerType: "user", ownerId: seeded.adminUserId, name: "irrelevant-name" }),
```

Test `"returns 422 CANNOT_FORK_OWN_SKILL when the owner forks their own skill"` (around line 125):

```ts
        body: JSON.stringify({ ownerType: "user", ownerId: seeded.adminUserId, name: "irrelevant-name" }),
```

Test `"returns 403 SUBSCRIBER_NOT_AUTHORIZED forking into a different user's ownership"` (around line 152):

```ts
        body: JSON.stringify({ ownerType: "user", ownerId: memberC.userId, name: "irrelevant-name" }),
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/app/api/skills/\[name\]/fork/route.test.ts`

Expected: FAIL — `forkSchema` doesn't declare `name` yet, so Zod strips it from the parsed body; `forkSkill` then receives `name: undefined` and the insert fails a NOT NULL constraint, surfacing as an unhandled error (500) instead of the expected 201/404/422/403.

- [ ] **Step 3: Add `name`/`description` to `forkSchema`**

In `src/app/api/skills/[name]/fork/route.ts`, change:

```ts
const forkSchema = z.object({
  ownerType: z.enum(["user", "team"]),
  ownerId: z.string().min(1),
});
```

to:

```ts
const forkSchema = z.object({
  ownerType: z.enum(["user", "team"]),
  ownerId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/app/api/skills/\[name\]/fork/route.test.ts`

Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/skills/\[name\]/fork/route.ts src/app/api/skills/\[name\]/fork/route.test.ts
git commit -m "feat: require name on the REST skill fork endpoint"
```

---

### Task 4: `PromptDetailData.isOwnSkill` hides the button for skills you own (TDD)

**Files:**
- Modify: `src/app/(app)/prompts/[name]/prompt-detail-view.tsx`
- Test: `src/app/(app)/prompts/[name]/prompt-detail-view.test.tsx`

- [ ] **Step 1: Add `isOwnSkill` to the test fixture and write the failing test**

In `src/app/(app)/prompts/[name]/prompt-detail-view.test.tsx`, add `isOwnSkill: false,` to `baseData` right after `ownerLabel: "alice",` (line 10) — `baseData` represents viewing a skill owned by "alice", not the current caller, so `false` matches the existing "still renders Make a copy" assertion.

Then add this new test after the `"still renders Make a copy, Deprecate, and New version..."` test (after line 97):

```ts
  it("hides Make a copy when the caller owns the skill", () => {
    const html = renderToStaticMarkup(<PromptDetailView {...baseProps} data={{ ...baseData, isOwnSkill: true }} />);

    expect(html).not.toContain("Make a copy");
    expect(html).toContain("Deprecate");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run "src/app/(app)/prompts/[name]/prompt-detail-view.test.tsx"`

Expected: FAIL on two counts — TypeScript/test run errors because `isOwnSkill` isn't a known field on `PromptDetailData` yet (`baseData` literal doesn't type-check), and once that's worked around, the new test fails because the button always renders today.

- [ ] **Step 3: Add the field and gate the button**

In `src/app/(app)/prompts/[name]/prompt-detail-view.tsx`, add to the `PromptDetailData` interface, right after `ownerLabel: string;` (around line 46):

```ts
  /** True when the current caller personally owns this skill — "Make a copy" is hidden for it (self-copy stays rejected server-side). */
  isOwnSkill: boolean;
```

Then change the "Make a copy" button (around line 284-290):

```tsx
            <button
              type="button"
              onClick={onFork}
              className="rounded-control border border-border-2 bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-dim"
            >
              Make a copy
            </button>
```

to:

```tsx
            {!data.isOwnSkill ? (
              <button
                type="button"
                onClick={onFork}
                className="rounded-control border border-border-2 bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-dim"
              >
                Make a copy
              </button>
            ) : null}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run "src/app/(app)/prompts/[name]/prompt-detail-view.test.tsx"`

Expected: PASS — all tests in the file green, including the new hide-button test.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/prompts/[name]/prompt-detail-view.tsx" "src/app/(app)/prompts/[name]/prompt-detail-view.test.tsx"
git commit -m "feat: hide Make a copy button when the caller owns the skill"
```

---

### Task 5: `page.tsx` computes and passes `isOwnSkill`

No dedicated unit test — this file is a server component reading live DB state, matching this repo's established convention (verified via the manual browser pass in Task 9, not a unit test).

**Files:**
- Modify: `src/app/(app)/prompts/[name]/page.tsx`

- [ ] **Step 1: Compute `isOwnSkill`**

In `src/app/(app)/prompts/[name]/page.tsx`, right after the `ownerLabel` computation (around line 52, after the `??` fallback line), add:

```ts
    const isOwnSkill = prompt.ownerType === "user" && prompt.ownerId === user.id;
```

- [ ] **Step 2: Pass it through in the returned `PromptDetailData`**

In the `result: PromptDetailData = { ... }` object (around line 130-133), add `isOwnSkill,` right after `ownerLabel,`:

```ts
      ownerLabel,
      isOwnSkill,
      sourceUrl: prompt.sourceUrl,
```

- [ ] **Step 3: Run the project build to catch any type mismatch**

Run: `pnpm typecheck`

Expected: PASS with no new errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/prompts/[name]/page.tsx"
git commit -m "feat: compute isOwnSkill for the prompt detail page"
```

---

### Task 6: `CopySkillDrawer` component (TDD)

**Files:**
- Create: `src/app/(app)/prompts/[name]/copy-skill-drawer.tsx`
- Test: `src/app/(app)/prompts/[name]/copy-skill-drawer.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/app/(app)/prompts/[name]/copy-skill-drawer.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { expectNoCriticalOrSeriousAxeViolations } from "@/shared/testing/accessibility";
import { CopySkillDrawer } from "./copy-skill-drawer";

const baseProps = {
  sourceName: "commit-message",
  sourceDescription: "Generates a commit message.",
  onClose: vi.fn(),
  onSubmit: vi.fn().mockResolvedValue({ ok: true }),
};

describe("CopySkillDrawer", () => {
  it("prefills name and description from the source skill", () => {
    const html = renderToStaticMarkup(<CopySkillDrawer {...baseProps} />);

    expect(html).toContain("Copy skill");
    expect(html).toContain("commit-message-copy");
    expect(html).toContain("Generates a commit message.");
  });

  it("has no critical or serious axe violations (Constitution Principle VIII)", async () => {
    const html = renderToStaticMarkup(<CopySkillDrawer {...baseProps} />);
    await expectNoCriticalOrSeriousAxeViolations(html);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run "src/app/(app)/prompts/[name]/copy-skill-drawer.test.tsx"`

Expected: FAIL — `Cannot find module './copy-skill-drawer'` (the component doesn't exist yet).

- [ ] **Step 3: Implement `CopySkillDrawer`**

Create `src/app/(app)/prompts/[name]/copy-skill-drawer.tsx`:

```tsx
"use client";

import { useId, useState, useTransition } from "react";
import { Drawer } from "@/shared/ui";
import type { PromptActionResult } from "../actions";

export interface CopySkillValues {
  name: string;
  description?: string;
}

export interface CopySkillDrawerProps {
  sourceName: string;
  sourceDescription: string;
  onClose: () => void;
  onSubmit: (values: CopySkillValues) => Promise<PromptActionResult>;
}

/**
 * Step 1 of the "Make a copy" flow (2026-08-15 design doc) — collects the
 * copy's name/description, prefilled from the source and fully editable.
 * On success the caller opens Step 2 (a source-prefilled New Version
 * drawer) to edit and publish the copy's actual content; this drawer never
 * touches content itself.
 */
export function CopySkillDrawer({ sourceName, sourceDescription, onClose, onSubmit }: CopySkillDrawerProps) {
  const titleId = useId();
  const [name, setName] = useState(`${sourceName}-copy`);
  const [description, setDescription] = useState(sourceDescription);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await onSubmit({ name, description: description || undefined });
      if (!result.ok) {
        setError(result.error);
      }
    });
  }

  return (
    <Drawer onClose={onClose} labelledBy={titleId} widthClassName="w-[480px]">
      <div className="flex h-14 items-center justify-between border-b border-border px-5">
        <span id={titleId} className="font-display text-[15px] font-semibold">
          Copy skill
        </span>
        <button
          type="button"
          onClick={onClose}
          className="grid size-7.5 place-items-center rounded-control border border-border text-dim"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5.5 py-5">
        {error ? (
          <div className="rounded-card border border-red/30 bg-red-soft p-3 text-[12px] text-red">{error}</div>
        ) : null}
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-dim">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-control border border-border-2 bg-surface px-3 py-2.5 font-mono text-[13px] text-text outline-none focus:border-a"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-dim">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="resize-y rounded-control border border-border-2 bg-surface px-3 py-2.5 text-[13px] text-text outline-none focus:border-a"
          />
        </label>
        <div className="rounded-card border border-a/25 bg-a-soft p-3 text-[11.5px] leading-relaxed text-dim">
          Creates an independent copy under your ownership. Next you&apos;ll be able to edit its content
          before it&apos;s published as v1.
        </div>
      </div>

      <div className="flex justify-end gap-2.5 border-t border-border px-5.5 py-3.5">
        <button
          type="button"
          onClick={onClose}
          className="rounded-control border border-border-2 bg-surface px-4 py-2.5 text-[13px] font-semibold text-text"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={isPending || !name.trim()}
          onClick={submit}
          className="rounded-control bg-a px-4.5 py-2.5 text-[13px] font-semibold text-a-fg shadow-glow disabled:opacity-50"
        >
          {isPending ? "Copying…" : "Copy & edit content"}
        </button>
      </div>
    </Drawer>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run "src/app/(app)/prompts/[name]/copy-skill-drawer.test.tsx"`

Expected: PASS — both tests green.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/prompts/[name]/copy-skill-drawer.tsx" "src/app/(app)/prompts/[name]/copy-skill-drawer.test.tsx"
git commit -m "feat: add CopySkillDrawer for editable skill copy name/description"
```

---

### Task 7: Wire server actions and the two-drawer flow

No dedicated automated test — `forkSkillForSelfAction`/`forkSkillAction` are thin wrappers around already-tested `forkSkill` (Task 2), matching every sibling simple action in this file (none of `deprecatePromptAction`, `subscribeSkillAction`, etc. have a dedicated test); `prompt-detail.tsx` is the thin client wrapper this repo's View/wrapper convention deliberately leaves untested (only the pure `*View` gets structural tests — see Task 4). Verified via the manual browser pass in Task 9.

**Files:**
- Modify: `src/app/(app)/prompts/actions.ts:386-417`
- Modify: `src/app/(app)/prompts/[name]/prompt-detail.tsx`

- [ ] **Step 1: Update `forkSkillAction` and `forkSkillForSelfAction`**

In `src/app/(app)/prompts/actions.ts`, replace (lines 386-417):

```ts
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
```

with:

```ts
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
```

- [ ] **Step 2: Wire the two-drawer flow in `prompt-detail.tsx`**

In `src/app/(app)/prompts/[name]/prompt-detail.tsx`, add the import:

```ts
import { CopySkillDrawer } from "./copy-skill-drawer";
```

Add two pieces of state alongside the existing drawer state (near `const [shareOpen, setShareOpen] = useState(false);`):

```ts
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyTargetName, setCopyTargetName] = useState<string | null>(null);
```

Replace the existing `onFork` handler:

```tsx
        onFork={async () => {
          await forkSkillForSelfAction(data.id);
          router.push("/prompts");
        }}
```

with:

```tsx
        onFork={() => setCopyOpen(true)}
```

After the closing `)}` of the existing `{newVersionOpen ? ( ... ) : null}` block (right before `{shareOpen ? (`), add the two new drawers:

```tsx
      {copyOpen ? (
        <CopySkillDrawer
          sourceName={data.name}
          sourceDescription={data.description}
          onClose={() => setCopyOpen(false)}
          onSubmit={async (values) => {
            const result = await forkSkillForSelfAction(data.id, values);
            if (result.ok) {
              setCopyOpen(false);
              setCopyTargetName(values.name);
            }
            return result;
          }}
        />
      ) : null}
      {copyTargetName ? (
        <NewVersionDrawer
          promptName={copyTargetName}
          nextVersionLabel="v1"
          mainFileContent={
            data.isLegacyShape
              ? `System template:\n${data.legacySystemTemplate ?? ""}\n\nUser template:\n${data.legacyUserTemplate ?? ""}`
              : (data.files.find((f) => f.isMain)?.content ?? "")
          }
          supportingFiles={
            data.isLegacyShape ? [] : data.files.filter((f) => !f.isMain).map(({ name, content }) => ({ name, content }))
          }
          tags={data.versions.find((v) => v.isActive)?.tags ?? []}
          activeVersionKind={data.kind}
          activeVersionSteps={(data.steps ?? []).map((s) => ({
            id: s.id,
            promptName: s.promptName,
            promptVersion: s.promptVersionLabel ?? "",
            dependsOn: s.dependsOn,
          }))}
          accessibleSkillNames={data.accessibleSkillNames}
          onClose={() => setCopyTargetName(null)}
          onSubmit={async (values) => {
            const result = await publishVersionAction({ promptName: copyTargetName, ...values });
            if (result.ok) {
              setCopyTargetName(null);
              router.push(`/prompts/${copyTargetName}`);
            }
            return result;
          }}
        />
      ) : null}
```

- [ ] **Step 3: Run typecheck and lint**

Run: `pnpm typecheck && pnpm lint`

Expected: PASS with no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/prompts/actions.ts "src/app/(app)/prompts/[name]/prompt-detail.tsx"
git commit -m "feat: wire the two-drawer editable skill-copy flow"
```

---

### Task 8: File the entitlement-gating gap against its owning backlog item

The design doc's constitution-compliance review (Principle VII) surfaced that `prompt-registry`'s skill creation/sharing surface has no entitlement gating at all — a pre-existing gap this change doesn't introduce but shouldn't leave as only a chat mention, per this repo's convention of tracking forward dependencies on the backlog item that actually owns them.

**Files:**
- Modify: `backlog/009-billing-entitlements/004-entitlement-enforcement-integration.md`

- [ ] **Step 1: Add a requirement bullet and note**

This has already been done as part of writing this plan — verify the file contains a bullet under `## Requirements` referencing `006-prompt-registry`'s `createPrompt`/`forkSkill`/`subscribeSkill` gap, dated 2026-08-15, citing this feature's design doc. If missing, add:

```markdown
- [ ] `006-prompt-registry`'s skill creation/sharing surface (`createPrompt`, `forkSkill`, `subscribeSkill`) has no entitlement check at all today — not even a hardcoded stand-in. Identified 2026-08-15 while reworking `forkSkill`'s "Make a copy" flow (`docs/superpowers/specs/2026-08-15-editable-skill-copy-design.md`); left unfixed there as out of scope for a UX-only change. Needs a real gate here (or, at minimum, a hardcoded-Free stand-in matching this file's own convention) before this item can be considered complete.
```

- [ ] **Step 2: Commit**

```bash
git add backlog/009-billing-entitlements/004-entitlement-enforcement-integration.md
git commit -m "docs: track prompt-registry's entitlement-gating gap on its owning backlog item"
```

---

### Task 9: Manual browser verification

No code changes — this task confirms the full flow end to end, per this repo's established convention for client-interaction-heavy drawer flows that aren't covered by `renderToStaticMarkup` (conditionally-rendered drawers, real click/submit timing).

- [ ] **Step 1: Start the dev server**

Run: `pnpm dev` (or reuse an already-running shared dev stack per this repo's Docker conventions — check before rebuilding).

- [ ] **Step 2: Verify the button is hidden on a skill you own**

As a logged-in user, open a skill's detail page that you personally own (`ownerType: "user"`, `ownerId` = your own id). Confirm "Make a copy" is **not** present in the header actions.

- [ ] **Step 3: Verify the full copy flow on a skill you don't own**

Open a skill's detail page owned by a different user (or one you've subscribed to but don't own). Click "Make a copy". Confirm:
- The Copy skill drawer opens, prefilled with `<source-name>-copy` and the source's description.
- Edit the name and description, click "Copy & edit content".
- The New Version drawer opens automatically, prefilled with the source's main file/supporting files (or steps, if the source is chain-kind) and tags.
- Edit the content, submit.
- You land on the new skill's own detail page (`/prompts/<new-name>`), showing the edited content as its `v1`, and its `forkedFromSkillId` lineage recorded (visible via the source's "N copies" pill incrementing, or by checking the audit log if accessible).

- [ ] **Step 4: Verify the duplicate-name rejection surfaces inline**

Repeat Step 3's copy flow but submit a name that already exists in the org. Confirm the Copy skill drawer shows an inline error (not a silent failure or unhandled crash) and stays open for you to retry with a different name.
