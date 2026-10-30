import { bigint, index, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { id, organizationId } from "@/shared/db/columns";
import { vcsIntegrationSchema } from "@/shared/db/schemas";

/**
 * One row per GitHub App installation. Never holds the App private key or an
 * installation access token (both are minted/read from env on demand).
 * `deleted_at` is a soft delete: repo links and PR check history must stay
 * readable after an uninstall (011-001, hard FKs everywhere else).
 */
export const installations = vcsIntegrationSchema.table(
  "installations",
  {
    id: id(),
    organizationId: organizationId(),
    githubInstallationId: bigint("github_installation_id", { mode: "number" }).notNull(),
    githubAccountLogin: text("github_account_login").notNull(),
    githubAccountType: text("github_account_type", { enum: ["Organization", "User"] }).notNull(),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("installations_github_installation_id_unique").on(table.githubInstallationId),
    index("installations_organization_id_index").on(table.organizationId),
  ],
);

/**
 * GitHub delivery ids already handled, so a redelivery is a no-op. No
 * organization column: a delivery is received before an org is resolved, so
 * this table is reachable only by the webhook role, never the app role.
 */
export const webhookDeliveries = vcsIntegrationSchema.table("webhook_deliveries", {
  deliveryId: text("delivery_id").primaryKey(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});
