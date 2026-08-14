# Contract: `countForksOfSkill`

**Bounded context**: `prompt-registry`
**Layer**: `application/count-forks-of-skill.ts`, backed by
`infrastructure/prompts-repo.ts`'s `countForksOfSkill`
**Exposed via**: BC barrel (`src/bcs/prompt-registry/index.ts`), documented
in `CONTRACT.md` alongside the existing `listSubscriptionsForSkill` entry
(same table row style)

## Signature

```ts
countForksOfSkill(db: Db, organizationId: string, sourceSkillId: string): Promise<number>
```

## Behavior

Returns the count of skills within `organizationId` whose
`forked_from_skill_id` equals `sourceSkillId`. A pure, unauthenticated
count — no `db` transaction requirement beyond the caller's own (same
posture as `listSubscriptionsForSkill`), no audit write (a read, not a
mutation; Principle VI only requires auditing mutations and
cross-tenant-sensitive reads — an org-scoped count of one's own skills'
forks is neither).

Never throws for a nonexistent `sourceSkillId` — returns `0`, matching the
existing `listSubscriptionsForSkill`'s behavior for a skill with no
subscriptions (empty array, not an error).

## Contract entry for `CONTRACT.md`

To be added as a new row in the "Exposed APIs" table, matching the
existing style:

| Endpoint / Method | Description | Consumers |
|---|---|---|
| `countForksOfSkill(db, orgId, sourceSkillId)` (038-skill-share-consolidation) | Count of skills within the organization forked from this one (`forkedFromSkillId` match). A pure, unauthenticated read powering the Share drawer's "X teams · Y subscribers · Z copies" summary. | Distribution (route handlers) |

## Consumers

- `src/app/(app)/prompts/[name]/page.tsx` — the skill detail page loader,
  called alongside the existing `listSubscriptionsForSkill` in the page's
  `Promise.all([...])` data-fetch block.

## Non-goals

- Does not resolve *which* skills forked this one, or their names/owners —
  a pure count only. (No consumer of this feature needs the list; if a
  future feature does, it's a separate function, not an extension of this
  one's contract.)
- Does not filter by the viewing user's accessibility — this is
  deliberately an org-wide count, not scoped to what the viewer can see
  (see `research.md` Decision 2's rejected alternative for why
  `listPrompts`'s accessible-set can't be reused here).
