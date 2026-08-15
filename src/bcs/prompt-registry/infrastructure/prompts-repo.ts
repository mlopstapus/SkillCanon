import { and, asc, count, eq, inArray, or } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { PromptOwnerType } from "../domain/prompt";
import { prompts, subscriptions } from "./schema";

type Tx = PostgresJsDatabase<Record<string, never>>;

export interface InsertPromptParams {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  isDeprecated: boolean;
  activeVersionId: string | null;
  ownerType: PromptOwnerType;
  ownerId: string;
  forkedFromSkillId?: string | null;
  sourceUrl?: string | null;
}

export async function insertPrompt(tx: Tx, params: InsertPromptParams) {
  const [row] = await tx
    .insert(prompts)
    .values({ forkedFromSkillId: null, sourceUrl: null, ...params })
    .returning();
  if (!row) {
    throw new Error("Prompt insert returned no row.");
  }
  return row;
}

export async function findPromptByOrgAndName(tx: Tx, organizationId: string, name: string) {
  const [row] = await tx
    .select()
    .from(prompts)
    .where(and(eq(prompts.organizationId, organizationId), eq(prompts.name, name)));
  return row ?? null;
}

export async function findPromptByOrgAndId(tx: Tx, organizationId: string, promptId: string) {
  const [row] = await tx
    .select()
    .from(prompts)
    .where(and(eq(prompts.organizationId, organizationId), eq(prompts.id, promptId)));
  return row ?? null;
}

export async function listPromptsByOrg(tx: Tx, organizationId: string) {
  return tx.select().from(prompts).where(eq(prompts.organizationId, organizationId)).orderBy(asc(prompts.name));
}

/** Count of skills within the organization forked from `sourceSkillId` (038-skill-share-consolidation). */
export async function countForksOfSkill(tx: Tx, organizationId: string, sourceSkillId: string): Promise<number> {
  const [row] = await tx
    .select({ value: count() })
    .from(prompts)
    .where(and(eq(prompts.organizationId, organizationId), eq(prompts.forkedFromSkillId, sourceSkillId)));
  return row?.value ?? 0;
}

/**
 * The caller's *accessible* set (data-model.md's Query Shapes): skills the
 * caller owns, skills their own team owns, and skills they (or their team)
 * subscribe to — one joined query rather than three round-trips unioned in
 * application code, so org-scoping and de-duplication (a skill the caller
 * both owns *and* is somehow subscribed to should appear once) live in one
 * place. `userTeamId` is nullable (an unassigned user, per
 * 019-account-team-settings-ui) — contributes nothing to either the
 * team-ownership or team-subscription branch when null.
 */
export async function listAccessibleByOwnerAndSubscriptions(
  tx: Tx,
  organizationId: string,
  userId: string,
  userTeamId: string | null,
  userProjectIds: string[] = [],
) {
  const ownerConditions = [and(eq(prompts.ownerType, "user"), eq(prompts.ownerId, userId))];
  const subscriberConditions = [
    and(eq(subscriptions.subscriberType, "user"), eq(subscriptions.subscriberId, userId)),
  ];
  if (userTeamId) {
    ownerConditions.push(and(eq(prompts.ownerType, "team"), eq(prompts.ownerId, userTeamId)));
    subscriberConditions.push(
      and(eq(subscriptions.subscriberType, "team"), eq(subscriptions.subscriberId, userTeamId)),
    );
  }
  if (userProjectIds.length > 0) {
    // A project-level subscription (023-prompt-registry-views-ui) extends
    // access to every member of that project — a third subscriber kind
    // alongside user/team, resolved the same way.
    subscriberConditions.push(
      and(eq(subscriptions.subscriberType, "project"), inArray(subscriptions.subscriberId, userProjectIds)),
    );
  }

  const rows = await tx
    .select({ prompt: prompts })
    .from(prompts)
    .leftJoin(subscriptions, eq(subscriptions.sourceSkillId, prompts.id))
    .where(
      and(
        eq(prompts.organizationId, organizationId),
        or(
          or(...ownerConditions),
          and(eq(subscriptions.organizationId, organizationId), or(...subscriberConditions)),
        ),
      ),
    );

  const seen = new Map<string, (typeof rows)[number]["prompt"]>();
  for (const row of rows) {
    seen.set(row.prompt.id, row.prompt);
  }
  return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function updatePrompt(
  tx: Tx,
  promptId: string,
  fields: Partial<{
    isDeprecated: boolean;
    activeVersionId: string | null;
    description: string | null;
    ownerType: PromptOwnerType;
    ownerId: string;
  }>,
) {
  const [row] = await tx
    .update(prompts)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(prompts.id, promptId))
    .returning();
  return row ?? null;
}
