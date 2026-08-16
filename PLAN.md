# Skill Ownership Transfer

## Context

Skills (`prompt_registry.prompts`) are owned by exactly one user or team (`ownerType`/`ownerId`). Today the only ways a skill "moves" between owners are `forkSkill` (creates an independent copy under a new owner, original untouched) and `subscribeSkill` (a live reference, not a move) — this is a **deliberate, documented design guarantee** from PDR-016, restated in `CONTRACT.md`'s Stability Guarantees section: *"A skill's `ownerType`/`ownerId` never changes in place... not reassigned."* A characterization test (`personal-to-team-sharing.test.ts`) actively guards against any such function ever being added to the BC's public barrel.

The problem: fork-based "transfer" silently orphans state that references the original skill's `id` — subscriptions, project assignments, and fork lineage from *other* skills all stay pointed at the old (now presumably deprecated) row. There's no way to relocate who administers an existing skill without losing that.

We're deliberately reversing PDR-016's immutability guarantee via a new PDR, adding a real `transferSkillOwnership` function that mutates `ownerType`/`ownerId` in place, preserving the skill's `id` and everything that references it. Confirmed with the user: full bidirectional transfer (user↔team, team↔team), initiated by an org admin or the skill's current owner, plus a UI to do it from the skill detail page.

## Sequencing

1. PDR-019 + `CONTRACT.md`/`OWNERSHIP.md` edits + characterization test fix (docs/guardrail first, so intent is explicit before code)
2. Domain errors + `updatePrompt` repo extension + `transferSkillOwnership` application function + its tests (core logic, fully green before downstream layers)
3. Barrel export + REST route + `errors.ts` registry + route tests
4. Server Action + UI drawer + detail-page wiring

## 1. New PDR — `docs/pdr/019-skill-ownership-transfer.md`

Follow PDR-016's exact structure (`Status`/`Date`/`Context`/`Options Considered`/`Decision`/`Consequences`/`Related changes made in this decision`).

- **Status:** Accepted, **Date:** 2026-08-14
- **Context:** restate PDR-016's guarantee and why it's being revisited — fork-based moves orphan subscriptions/project assignments/fork lineage that reference the original skill's `id`.
- **Options:** A — keep fork/subscribe-only (status quo, doesn't solve orphaning). B — in-place `ownerType`/`ownerId` mutation (chosen: preserves `id` and everything referencing it; reverses the stability guarantee, needs new authorization reasoning). C — fork+delete-original hybrid (still loses `id`, deleting the original is a bigger and less reversible operation than a field update — strictly worse than B).
- **Decision:** Option B. Add `transferSkillOwnership`, authorized to the skill's current owner or an org admin, with a `skill.owner_transferred` audit event (before/after). Fork/subscribe remain untouched — they're for a *different* party gaining their own copy/reference; transfer is solely for relocating who administers the one canonical row.
- **Consequences:** positive — subscriptions/assignments/lineage/audit history keep resolving correctly across an ownership change. Negative — `CONTRACT.md`/`OWNERSHIP.md` must be corrected in the same change; the characterization test asserting the opposite must be fixed, not left stale-but-green.
- **Related changes:** list every file this plan touches (mirrors PDR-016's own list).

## 2. `CONTRACT.md` / `OWNERSHIP.md` edits

**`src/bcs/prompt-registry/CONTRACT.md`** (Stability Guarantees section, line 142): replace *"A skill's `ownerType`/`ownerId` never changes in place... not reassigned."* with: *"A skill's `ownerType`/`ownerId` can change in place via `transferSkillOwnership` (PDR-019), authorized to the skill's current owner or an org admin — the one exception to fork/subscribe being the only owner-facing operations. Every other identity (`id`, versions, subscriptions, project assignments, fork lineage) is unaffected by a transfer."* Add a row to the Exposed APIs table for `transferSkillOwnership`, and an entry to Events Published for `SkillOwnershipTransferred`. Line 12's "owned by exactly one user or team, never a project" stays true — don't touch it, only the immutability claim changes.

**`OWNERSHIP.md`** line 22: append to the `prompts` row — *"mutable in place via `transferSkillOwnership` (PDR-019); PDR-016's who-can-own rule is unchanged, only whether the current owner can be reassigned."*

## 3. Characterization test — `personal-to-team-sharing.test.ts`

Delete only the third `it()` block (lines 65–83, `"no function exported... can reassign an existing skill's owner in place"`) — its premise becomes false the moment `transferSkillOwnership` is exported. Keep the first two `it()` blocks (lines 25–63) — they characterize that fork/subscribe themselves never mutate the source, which stays true and valuable. Add a new characterization-style assertion in the new `transfer-skill-ownership.test.ts` (section 7) proving the *opposite* is now true for the new function specifically, and that everything else (`id`, `activeVersionId`, `forkedFromSkillId`) stays intact across a transfer.

## 4. New domain errors — `src/bcs/prompt-registry/domain/subscription.ts`

Add, following this file's existing per-operation error convention (`CannotForkOwnSkillError` is fork-specific, not shared):

```ts
export class SkillNotFoundForTransferError extends Error { ... } // skillId doesn't exist / wrong org
export class CrossOrgTransferError extends Error { ... }          // newOwnerId nonexistent or wrong org
export class CannotTransferToSameOwnerError extends Error { ... } // newOwnerType/Id === current owner
```

Authorization failures reuse the existing `SubscriberNotAuthorizedError` (already registered in `errors.ts`) — no new class needed for that path.

## 5. New application function — `src/bcs/prompt-registry/application/transfer-skill-ownership.ts`

```ts
export async function transferSkillOwnership(
  db: PostgresJsDatabase<Record<string, never>>,
  actingUser: UserSummary,
  skillId: string,
  params: { newOwnerType: OwnerType; newOwnerId: string },
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
): Promise<PromptSummary>
```

Modeled directly on `fork-skill.ts`'s existing structure:

1. `findPromptByOrgAndId(db, actingUser.orgId, skillId)` — throw `SkillNotFoundForTransferError` if not found.
2. Same-owner check (mirrors `forkSkill`'s `CannotForkOwnSkillError` precedent, checked *before* authorization): if `source.ownerType === newOwnerType && source.ownerId === newOwnerId`, throw `CannotTransferToSameOwnerError`. Explicit rejection, not a silent no-op — matches fork's precedent, and a no-op would make the audit trail either misleading (identical before/after) or silently suppressed.
3. **Authorization** — special-case admin bypass inline in this function, not in the shared helper:
   ```ts
   if (actingUser.role !== "admin") {
     await assertAuthorizedForOwner(db, actingUser, source.ownerType, source.ownerId);   // authorized over current owner
     await assertAuthorizedForOwner(db, actingUser, params.newOwnerType, params.newOwnerId); // authorized over new owner
   }
   ```
   **Why not extend `assertAuthorizedForOwner` itself:** it's a five-caller shared primitive (`forkSkill`, `subscribeSkill`, `addCollaboratorTeam`, `assignSkillToProject`, `unsubscribeSkill`), and its `"user"` branch's lack of an admin bypass is deliberate for those callers (no product reason an admin should fork/subscribe *as* an arbitrary user — that's impersonation, not administration). A 3-line early-return in the one function that needs the exception is cheaper to review than widening a shared helper's behavior for four unrelated callers.
   **Why destination authorization is required even for a non-admin transferring their own skill:** otherwise any individual could dump ownership onto a team with no say in the matter, and (per `listPrompts`' accessible-set logic) potentially lose their own visibility into it in the same step with no team-side approval. Requiring both ends means every non-admin transfer has a legitimate keyholder on both sides.
4. New-owner existence/cross-org check, unconditional (runs even when authorization was bypassed for an admin, since that's otherwise the only guard against a typo'd `newOwnerId`): `getTeam`/`getUser` in a try/catch, rethrown as `CrossOrgTransferError` — mirrors `assertAuthorizedForOwner`'s existing `CrossOrgSubscriberError` pattern at `authorize-owner-action.ts:60-64`.
5. Mutation + audit via `withAudit` (same shape as `forkSkill`'s use, `fork-skill.ts:62-110`):
   ```ts
   return withAudit(
     db,
     (tx) => updatePrompt(tx, skillId, { ownerType: params.newOwnerType, ownerId: params.newOwnerId }).then((u) => u ?? source),
     (tx) => record(tx, {
       organizationId: actingUser.orgId, actorUserId: actingUser.id, actorApiKeyId: null,
       action: "skill.owner_transferred", resourceType: "prompt", resourceId: skillId,
       before: { ownerType: source.ownerType, ownerId: source.ownerId },
       after: { ownerType: params.newOwnerType, ownerId: params.newOwnerId },
       transport: auditContext.transport, sourceIp: auditContext.sourceIp ?? null,
     }),
   );
   ```
   The audit closure captures `source`/`params` from outer scope (not `mutationFn`'s return) — `withAudit` never threads the mutation's result into the audit writer; this matches every existing caller (`forkSkill`, `reparentTeam`).

**No advisory lock.** `reparentTeam`'s lock exists to protect a multi-step tree-cycle check across concurrent mutations. This is a single-row field update with no traversal and no cycle risk — Postgres's own row-level lock on the `UPDATE` already serializes concurrent transfers of the same skill into an ordinary last-write-wins, identical to how `deprecatePrompt`/`reactivatePrompt` already behave with no lock. Adding one here would protect against nothing beyond default row-lock behavior.

**Repo change:** extend `updatePrompt`'s field type in `src/bcs/prompt-registry/infrastructure/prompts-repo.ts:118-125` from `Partial<{ isDeprecated, activeVersionId, description }>` to also include `ownerType?: PromptOwnerType; ownerId?: string` — small, additive, non-breaking.

## 6. Barrel export — `src/bcs/prompt-registry/index.ts`

Add a new section after "Skill Sharing — Subscribe & Fork" (around line 96):

```ts
// ---------------------------------------------------------------------------
// Skill Ownership Transfer (PDR-019)
// ---------------------------------------------------------------------------
export { transferSkillOwnership } from "./application/transfer-skill-ownership";
export { CannotTransferToSameOwnerError, CrossOrgTransferError, SkillNotFoundForTransferError } from "./domain/subscription";
```

## 7. Test plan — application layer

New `src/bcs/prompt-registry/application/transfer-skill-ownership.test.ts`, using `subscription-test-helpers.ts`'s existing fixtures (`makeSubscriptionFixtureOrg`, `createTestSkillOwnedByUser`, `queryPromptRows`; add a `createTestSkillOwnedByTeam` helper alongside if one doesn't already exist there):

- Success: user→team, team→team, team→user, each as the legitimate current-owner actor
- Success: org admin transferring team→team with no relation to either team
- Success: non-admin authorized on both source and destination (owns/administers both teams)
- Auth failure: non-admin not authorized over source
- Auth failure: non-admin authorized over source but not destination (proves destination check is real)
- Cross-org / nonexistent `newOwnerId` → `CrossOrgTransferError`
- Same-owner → `CannotTransferToSameOwnerError`, no audit event written
- Nonexistent `skillId` → `SkillNotFoundForTransferError`
- Audit event `before`/`after` shape correct (follow whatever readback helper `fork-skill.test.ts` already uses)
- Concurrent-safety: two transfers of the same skill in quick succession both complete cleanly, final state reflects whichever committed last (validates the no-lock reasoning empirically, not just in prose)

## 8. REST route — `POST /api/skills/[name]/transfer`

New `src/app/api/skills/[name]/transfer/route.ts`, modeled directly on `src/app/api/skills/[name]/fork/route.ts` (resolve-by-name via `getPrompt` first, map `null`→`SKILL_NOT_FOUND`, then call the BC function):

```ts
const transferSchema = z.object({ newOwnerType: z.enum(["user", "team"]), newOwnerId: z.string().min(1) });

export async function handlePost(request: Request, { caller, params, db }) {
  const body = transferSchema.parse(await request.json());
  return withTenantContext(db, caller.organizationId, async (tx) => {
    const prompt = await getPrompt(tx, { organizationId: caller.organizationId, userId: caller.actingUser.id }, params.name);
    if (!prompt) return Response.json(notFoundResponse("SKILL_NOT_FOUND", "Skill not found").body, { status: 404 });
    const result = await transferSkillOwnership(tx, caller.actingUser, prompt.id, body, caller.auditContext);
    return Response.json(result);
  });
}
export const POST = withApiRoute<Params>(handlePost);
```

`/transfer` (action-style route, consistent with `/fork`) rather than `PUT`/`/owner` (would read as idempotent resource replacement, which understates the authorization/side-effect complexity).

**`src/shared/api/errors.ts` additions:** import the three new error classes from `@/bcs/prompt-registry`, add to `REGISTRY` in the Prompt Registry section:
```ts
{ ctor: SkillNotFoundForTransferError, code: "SKILL_NOT_FOUND", status: 404 },
{ ctor: CrossOrgTransferError, code: "CROSS_ORG_TRANSFER", status: 404 },
{ ctor: CannotTransferToSameOwnerError, code: "CANNOT_TRANSFER_TO_SAME_OWNER", status: 422 },
```
(`SubscriberNotAuthorizedError` already registered at `SUBSCRIBER_NOT_AUTHORIZED`/403 — no new entry needed.)

New `route.test.ts` covering: 200 success, 404 unknown skill, 404 cross-org new owner, 422 same-owner, 403 unauthorized, 422 malformed body.

## 9. Server Action — `src/app/(app)/prompts/actions.ts`

Add near `forkSkillForSelfAction`:

```ts
export async function transferSkillOwnershipAction(
  skillId: string,
  promptName: string,
  params: { newOwnerType: "user" | "team"; newOwnerId: string },
): Promise<PromptActionResult> {
  try {
    const actingUser = await requireActingUser();
    await withTenantContext(db, actingUser.orgId, (tx) => transferSkillOwnership(tx, actingUser, skillId, params));
    revalidatePath("/prompts");
    revalidatePath(`/prompts/${promptName}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}
```

## 10. UI

**Candidate lists — no new Identity & Access read needed.** `src/app/(app)/prompts/[name]/page.tsx` already fetches org-wide `listUsers`/`listTeams` (lines 15, 39–40) to populate `ShareDrawer`. Reuse the same two arrays for transfer candidates, filtered to exclude the current owner (same filter `shareState.users` already applies at line 168).

**New `src/app/(app)/prompts/[name]/transfer-ownership-drawer.tsx`**, modeled on `share-drawer.tsx`'s search+list structure, built on `src/shared/ui/drawer.tsx`'s `Drawer` primitive, plus a confirmation step (this is consequential/hard-to-reverse, unlike Share's freely-reversible grants):

- Props: `promptName`, `currentOwnerLabel`, candidate users/teams lists, `onClose`, `onConfirm: (params) => Promise<PromptActionResult>`.
- A user/team mode toggle — **both candidate panels always mounted in the DOM**, inactive one hidden via class rather than conditionally unmounted (`{mode === "user" ? <A/> : null}`), per this repo's own documented fix for the "conditionally-unmounted tab panel is untestable via `renderToStaticMarkup`" gap already present in `new-prompt-drawer.tsx` — don't repeat that gap in a new component.
- Pick step → confirm step (single-select target, then "Transfer **{name}** from **{currentOwnerLabel}** to **{selected}**?" with a generic warning that the current owner may lose access if not otherwise subscribed — shown unconditionally rather than computed per-actor, since the UI can't cheaply know the destination's member overlap).

**Wiring:**
- `page.tsx`: compute `canTransferOwnership` server-side (`user.role === "admin" || (prompt.ownerType === "user" && prompt.ownerId === user.id) || (prompt.ownerType === "team" && team.ownerId === user.id)`, reusing the already-fetched `teams` array), and a `transferCandidates` shape from the existing `users`/`teams` fetches.
- `prompt-detail-view.tsx`: extend `PromptDetailData`/`PromptDetailViewProps` with `ownerType`, `ownerId`, `canTransferOwnership`, `transferCandidates`, `onOpenTransferOwnership`. Add a "Transfer ownership" button in the header actions block (~line 276-315), gated on `canTransferOwnership`, placed between Share and Make a copy.
- `prompt-detail.tsx`: add `transferOwnershipOpen` state and render block wiring `TransferOwnershipDrawer` to `transferSkillOwnershipAction`, calling `router.refresh()` on success (mirrors the existing `shareOpen`/`ShareDrawer` wiring).

## Verification

- `pnpm typecheck` and `pnpm vitest run src/bcs/prompt-registry/application/transfer-skill-ownership.test.ts src/bcs/prompt-registry/application/personal-to-team-sharing.test.ts src/app/api/skills/[name]/transfer/route.test.ts`
- `pnpm build` (client-component bundle check, per this repo's documented gotcha about client components importing BC barrels)
- Manual browser check on the shared dev stack: transfer a skill user→team and team→team via the new UI button, confirm the detail page's Owner field updates, confirm a previously-granted subscription to that skill still resolves after the transfer, confirm an unauthorized org member does not see the "Transfer ownership" button.
