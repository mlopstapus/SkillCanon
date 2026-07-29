import {
  type AnyPgColumn,
  boolean,
  index,
  jsonb,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { id, organizationId, timestamps } from "@/shared/db/columns";
import { identityAccessSchema } from "@/shared/db/schemas";

/**
 * The tenant-root aggregate (PDR-003) — unlike every other table in this
 * system, it carries no `organization_id` column and no RLS policy, since
 * it defines the tenant boundary rather than living inside one (see
 * data-model.md and plan.md's Constitution Check).
 *
 * `plan_id`/`stripe_customer_id` are nullable with no FK constraint yet —
 * `billing.plans` doesn't exist until epic 008 (research.md §4).
 */
export const organizations = identityAccessSchema.table("organizations", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  planId: uuid("plan_id"),
  stripeCustomerId: text("stripe_customer_id"),
  ...timestamps(),
});

/**
 * A node in one organization's recursive team hierarchy (006-team-hierarchy).
 * `slug` is unique per-organization, not globally (FR-002) — correcting the
 * current Python schema's global uniqueness, the same class of bug PDR-003
 * exists to prevent. `owner_id`'s FK to `identity_access.users` is added
 * below (007-user-accounts-registration/data-model.md) now that table
 * exists — deferred by this table's own original migration since `users`
 * didn't exist yet (research.md §1). No RLS policy yet either — deferred to
 * 007-tenant-isolation-tests-and-rls.md, which already depends on this
 * feature (plan.md's Complexity Tracking).
 */
export const teams = identityAccessSchema.table(
  "teams",
  {
    id: id(),
    organizationId: organizationId(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    ownerId: uuid("owner_id").references((): AnyPgColumn => users.id),
    parentTeamId: uuid("parent_team_id").references(
      (): AnyPgColumn => teams.id,
    ),
    ...timestamps(),
  },
  (table) => [unique().on(table.organizationId, table.slug)],
);

/**
 * A user account within one organization and one team (007-user-accounts-
 * registration). `(organization_id, email)`/`(organization_id, username)`
 * are composite-unique, never globally unique (FR-002) — the exact class of
 * bug PDR-003 exists to prevent. `email`/`username` are always stored
 * lowercased by the application layer (`insertValidatedUser`) so this plain
 * unique constraint transitively enforces case-insensitive uniqueness
 * (research.md §2) — no `citext` extension needed. No RLS policy yet either
 * — same deferral `teams` already carries, owned by
 * `007-tenant-isolation-tests-and-rls.md`.
 */
export const users = identityAccessSchema.table(
  "users",
  {
    id: id(),
    organizationId: organizationId(),
    /**
     * Nullable since 019-account-team-settings-ui: a user removed from
     * their team becomes "unassigned" (null) rather than deactivated —
     * the account stays active, but no team owns it until an admin
     * reassigns one. Always non-null at creation (`createUser`/
     * `acceptInvitation` always assign into a real team); only removal
     * ever sets it to null.
     */
    teamId: uuid("team_id").references(() => teams.id),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash"),
    role: text("role", { enum: ["admin", "member"] })
      .notNull()
      .default("member"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps(),
  },
  (table) => [
    unique().on(table.organizationId, table.email),
    unique().on(table.organizationId, table.username),
  ],
);

/**
 * An open offer for one email to join one organization on one team with one
 * role (009-invitations). `token` is the unique redemption credential — 32
 * bytes of CSPRNG output, base64url-encoded (research.md §2), never a
 * signed/derivable value. State (pending/accepted/expired/revoked) is
 * derived from `acceptedAt`/`revokedAt`/`expiresAt` at read time
 * (`deriveInvitationState`), not stored as its own column (research.md §1).
 * No RLS policy yet either — same deferral `teams`/`users` already carry,
 * owned by `007-tenant-isolation-tests-and-rls.md`.
 */
export const invitations = identityAccessSchema.table(
  "invitations",
  {
    id: id(),
    organizationId: organizationId(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id),
    email: text("email").notNull(),
    role: text("role", { enum: ["admin", "member"] })
      .notNull()
      .default("member"),
    token: text("token").notNull().unique(),
    invitedById: uuid("invited_by_id")
      .notNull()
      .references(() => users.id),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps(),
  },
  (table) => [index().on(table.organizationId, table.email)],
);

/**
 * A scoped bearer credential for non-browser clients (MCP/API access),
 * belonging to exactly one user (010-api-keys). Only a SHA-256 hash of the
 * raw key plus a short display `prefix` are ever stored — the raw value
 * exists solely in the creation response (research.md §3). `scopes` are
 * validated structurally (`<resource>:<action>`) and capped at the
 * creator's own role at creation time only (research.md §1–2); neither
 * rule is re-derived from this column at read time. No RLS policy yet
 * either — same deferral `teams`/`users`/`invitations` already carry,
 * owned by `007-tenant-isolation-tests-and-rls.md`.
 */
export const apiKeys = identityAccessSchema.table(
  "api_keys",
  {
    id: id(),
    organizationId: organizationId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    prefix: text("prefix").notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [index().on(table.organizationId, table.userId)],
);
