import { and, count, desc, eq, gte, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { installations, prChecks, repoLinks, webhookDeliveries } from "./schema";

type Db = PostgresJsDatabase<Record<string, never>>;
export type InstallationRow = typeof installations.$inferSelect;

export async function insertInstallation(db: Db, values: typeof installations.$inferInsert): Promise<InstallationRow> {
  const [row] = await db.insert(installations).values(values).returning();
  return row as InstallationRow;
}

export async function findByGithubInstallationId(db: Db, githubInstallationId: number): Promise<InstallationRow | undefined> {
  const [row] = await db.select().from(installations).where(eq(installations.githubInstallationId, githubInstallationId));
  return row;
}

export async function findByOrgAndId(db: Db, organizationId: string, id: string): Promise<InstallationRow | undefined> {
  const [row] = await db
    .select()
    .from(installations)
    .where(and(eq(installations.organizationId, organizationId), eq(installations.id, id)));
  return row;
}

export async function listActiveByOrg(db: Db, organizationId: string): Promise<InstallationRow[]> {
  return db
    .select()
    .from(installations)
    .where(and(eq(installations.organizationId, organizationId), isNull(installations.deletedAt)))
    .orderBy(installations.createdAt);
}

export async function updateInstallation(
  db: Db,
  id: string,
  set: Partial<Pick<InstallationRow, "suspendedAt" | "deletedAt">>,
): Promise<void> {
  await db.update(installations).set(set).where(eq(installations.id, id));
}

/** True the first time a delivery id is seen, false for a redelivery. */
export async function claimDelivery(db: Db, deliveryId: string): Promise<boolean> {
  const rows = await db.insert(webhookDeliveries).values({ deliveryId }).onConflictDoNothing().returning();
  return rows.length === 1;
}

export type RepoLinkRow = typeof repoLinks.$inferSelect;

export async function insertRepoLink(db: Db, values: typeof repoLinks.$inferInsert): Promise<RepoLinkRow> {
  const [row] = await db.insert(repoLinks).values(values).returning();
  return row as RepoLinkRow;
}

export async function findLiveRepoLink(db: Db, organizationId: string, id: string): Promise<RepoLinkRow | undefined> {
  const [row] = await db
    .select()
    .from(repoLinks)
    .where(and(eq(repoLinks.organizationId, organizationId), eq(repoLinks.id, id), isNull(repoLinks.unlinkedAt)));
  return row;
}

export async function listLiveRepoLinks(db: Db, organizationId: string, projectId?: string): Promise<RepoLinkRow[]> {
  return db
    .select()
    .from(repoLinks)
    .where(
      and(
        eq(repoLinks.organizationId, organizationId),
        isNull(repoLinks.unlinkedAt),
        projectId ? eq(repoLinks.projectId, projectId) : undefined,
      ),
    )
    .orderBy(repoLinks.createdAt);
}

export async function markRepoLinkUnlinked(db: Db, id: string, at: Date): Promise<void> {
  await db.update(repoLinks).set({ unlinkedAt: at }).where(eq(repoLinks.id, id));
}

export interface LiveLinkForRepo extends RepoLinkRow {
  githubInstallationId: number;
}

/** Live links for a GitHub repo id whose installation is active; used by the webhook, which has no org yet. */
export async function listLiveLinksForGithubRepo(db: Db, githubRepoId: number): Promise<LiveLinkForRepo[]> {
  const rows = await db
    .select({ link: repoLinks, githubInstallationId: installations.githubInstallationId })
    .from(repoLinks)
    .innerJoin(installations, eq(installations.id, repoLinks.installationId))
    .where(
      and(
        eq(repoLinks.githubRepoId, githubRepoId),
        isNull(repoLinks.unlinkedAt),
        isNull(installations.deletedAt),
        isNull(installations.suspendedAt),
      ),
    );
  return rows.map((r) => ({ ...r.link, githubInstallationId: r.githubInstallationId }));
}

export type PrCheckRow = typeof prChecks.$inferSelect;

export async function findPrCheck(db: Db, repoLinkId: string, prNumber: number, headSha: string): Promise<PrCheckRow | undefined> {
  const [row] = await db
    .select()
    .from(prChecks)
    .where(and(eq(prChecks.repoLinkId, repoLinkId), eq(prChecks.prNumber, prNumber), eq(prChecks.headSha, headSha)));
  return row;
}

export async function upsertPrCheck(db: Db, values: typeof prChecks.$inferInsert): Promise<PrCheckRow> {
  const [row] = await db
    .insert(prChecks)
    .values(values)
    .onConflictDoUpdate({
      target: [prChecks.repoLinkId, prChecks.prNumber, prChecks.headSha],
      set: {
        evaluatedAt: values.evaluatedAt ?? new Date(),
        results: values.results,
        status: values.status,
        githubCheckRunId: values.githubCheckRunId,
        error: values.error ?? null,
      },
    })
    .returning();
  return row as PrCheckRow;
}

export async function listPrChecksForLink(db: Db, organizationId: string, repoLinkId: string, prNumber: number): Promise<PrCheckRow[]> {
  return db
    .select()
    .from(prChecks)
    .where(and(eq(prChecks.organizationId, organizationId), eq(prChecks.repoLinkId, repoLinkId), eq(prChecks.prNumber, prNumber)))
    .orderBy(desc(prChecks.evaluatedAt));
}

export interface ProjectPrCheckRow extends PrCheckRow {
  repoFullName: string;
}

/** Latest evaluation of each PR across every repo ever linked to the project (history survives unlinking), newest first. */
export async function listLatestPrChecksForProject(db: Db, organizationId: string, projectId: string, limit: number): Promise<ProjectPrCheckRow[]> {
  const rows = await db
    .selectDistinctOn([prChecks.repoLinkId, prChecks.prNumber], { check: prChecks, repoFullName: repoLinks.repoFullName })
    .from(prChecks)
    .innerJoin(repoLinks, eq(repoLinks.id, prChecks.repoLinkId))
    .where(and(eq(prChecks.organizationId, organizationId), eq(repoLinks.projectId, projectId)))
    .orderBy(prChecks.repoLinkId, prChecks.prNumber, desc(prChecks.evaluatedAt));
  return rows
    .map((r) => ({ ...r.check, repoFullName: r.repoFullName }))
    .sort((a, b) => b.evaluatedAt.getTime() - a.evaluatedAt.getTime())
    .slice(0, limit);
}

export async function countPrChecksByStatus(
  db: Db,
  organizationId: string,
  projectId: string,
  since?: Date,
): Promise<Record<"pass" | "fail" | "neutral", number>> {
  const rows = await db
    .select({ status: prChecks.status, n: count() })
    .from(prChecks)
    .innerJoin(repoLinks, eq(repoLinks.id, prChecks.repoLinkId))
    .where(
      and(
        eq(prChecks.organizationId, organizationId),
        eq(repoLinks.projectId, projectId),
        since ? gte(prChecks.evaluatedAt, since) : sql`true`,
      ),
    )
    .groupBy(prChecks.status);
  const out = { pass: 0, fail: 0, neutral: 0 };
  for (const r of rows) out[r.status] = Number(r.n);
  return out;
}
