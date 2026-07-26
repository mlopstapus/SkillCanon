# Phase 1 Data Model: Auth & Onboarding UI

No new database table or column is introduced — every entity this feature
touches (`Organization`, `Team`, `User`, `Invitation`) already exists,
created/read entirely through `identity-access`'s existing repos. The one new
piece of shape is a domain type backing the new read-only function
(`previewInvitation`), documented here alongside the page-local UI state each
route manages.

## InvitationPreview (domain type, `identity-access/domain/invitation.ts`)

| Field | Type | Notes |
|---|---|---|
| `state` | `"pending" \| "accepted" \| "expired" \| "revoked"` | Derived via the existing `deriveInvitationState`, same precedence rule `acceptInvitation` uses |
| `email` | `string` | The invitee's email, shown read-only/locked — never editable input |
| `orgName` | `string` | Destination organization's display name |
| `teamName` | `string` | Destination team's display name |
| `role` | `"admin" \| "member"` | The role the invitation grants |

- Never includes `token`, `id`, or any other identifier — this is a
  display-only shape for an anonymous, pre-auth invitee, distinct from the
  org-admin-only `InvitationSummary` (FR-017).
- Returned by `previewInvitation(db, token): Promise<InvitationPreview | null>`;
  `null` for a token matching no invitation at all.

## Page-local UI state (ephemeral, not persisted)

### LoginFormState (`login/actions.ts`'s `useActionState` shape)

| Field | Type | Notes |
|---|---|---|
| `error` | `string \| undefined` | Set to the one generic credential-error message on failure (FR-003); `undefined` on first render |

### RegisterFormState

| Field | Type | Notes |
|---|---|---|
| `status` | `"idle" \| "blocked" \| "field-error"` | `"blocked"` switches the page to the "already set up" terminal view (FR-006); `"field-error"` keeps the form with an inline message |
| `error` | `string \| undefined` | Field-level message text (already-safe `.message` from `WeakPasswordError`/`DuplicateUserError`) |

### InviteFormState

Same shape as `RegisterFormState` minus `"blocked"` — an invite-page terminal
state is decided by the page's own `previewInvitation` call before the form
ever renders (see below), not by a submit-time status.

### Invite page view selection (`invite/[token]/page.tsx`, server-side, from `previewInvitation`'s result)

| `previewInvitation` result | Rendered view |
|---|---|
| `null` | `invite-invalid` |
| `{ state: "expired" }` | `invite-expired` |
| `{ state: "accepted" }` | `invite-accepted` |
| `{ state: "revoked" }` | `invite-revoked` |
| `{ state: "pending" }` | `invite-form`, pre-filled with `email`/`orgName`/`teamName`/`role` |

This mirrors the mockup's own `data-view`/`inviteState` switch (`form` /
`expired` / `accepted` / `revoked` / `invalid`) one-to-one.
