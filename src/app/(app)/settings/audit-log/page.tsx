import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  listAuditActorOptions,
  listAuditEvents,
  listAuditResourceTypeOptions,
  resolveAuditRows,
} from "@/bcs/audit-compliance";
import { authenticateSession } from "@/bcs/identity-access";
import { authDb, db, withTenantContext } from "@/shared/db";
import { canAccessAuditLog } from "./access";
import { AuditLog } from "./audit-log";
import { parseFilterState, toAuditEventFilters } from "./filter-params";

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const cookieHeader = (await headers()).get("cookie");
  const user = await authenticateSession(authDb, cookieHeader);

  if (!user) {
    redirect("/login");
  }
  if (!canAccessAuditLog(user)) {
    redirect("/dashboard");
  }

  const resolvedSearchParams = await searchParams;
  const filterState = parseFilterState(resolvedSearchParams);
  const now = new Date();
  const filters = toAuditEventFilters(filterState, now);

  const { page, resourceOptions, actorOptions, resolvedRows } = await withTenantContext(
    db,
    user.orgId,
    async (tx) => {
      const eventPage = await listAuditEvents(tx, user.orgId, filters, { requestingUserId: user.id, now });
      const retentionCutoff = new Date(now.getTime() - eventPage.retentionDays * 24 * 60 * 60 * 1000);
      const [resourceOptions, actorOptions, resolvedRows] = await Promise.all([
        listAuditResourceTypeOptions(tx, user.orgId, retentionCutoff),
        listAuditActorOptions(tx, user.orgId, user.id, retentionCutoff),
        resolveAuditRows(tx, user.orgId, user.id, eventPage.items),
      ]);
      return { page: eventPage, resourceOptions, actorOptions, resolvedRows };
    },
  );

  return (
    <AuditLog
      rows={resolvedRows}
      total={page.total}
      page={page.page}
      pageSize={page.pageSize}
      retentionDays={page.retentionDays}
      resourceOptions={resourceOptions}
      actorOptions={actorOptions}
    />
  );
}
