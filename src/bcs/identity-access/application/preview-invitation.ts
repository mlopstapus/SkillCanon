import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { InvitationPreview } from "../domain/invitation";
import { deriveInvitationState } from "../domain/invitation";
import { findByToken } from "../infrastructure/invitations-repo";
import { findById as findOrgById } from "../infrastructure/organizations-repo";
import { findById as findTeamById } from "../infrastructure/teams-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Read-only lookup for an anonymous, pre-auth invitee viewing their own
 * invite link — resolves the same token `acceptInvitation` would, but never
 * mutates anything. Added alongside the invite-accept UI (015-auth-onboarding-ui)
 * because that page needs to show the invitee which org/team/role they're
 * joining, and which of the four terminal states (expired/accepted/revoked/
 * invalid) applies, before they ever submit a form. `null` for an
 * unrecognized token. **Must be called with `authDb`** — same reason as
 * `acceptInvitation`: the token lookup has no organization context yet
 * (011-tenant-isolation-rls).
 */
export async function previewInvitation(
  db: Db,
  token: string,
): Promise<InvitationPreview | null> {
  const invitation = await findByToken(db, token);
  if (!invitation) {
    return null;
  }

  const [org, team] = await Promise.all([
    findOrgById(db, invitation.organizationId),
    findTeamById(db, invitation.teamId),
  ]);

  return {
    state: deriveInvitationState(invitation, new Date()),
    email: invitation.email,
    orgName: org?.name ?? "",
    teamName: team?.name ?? "",
    role: invitation.role,
  };
}
