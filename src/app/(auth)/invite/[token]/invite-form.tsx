"use client";

import { useActionState } from "react";
import type { InvitationPreview } from "@/bcs/identity-access";
import { AuthButton } from "../../_components/auth-button";
import { EmailIcon, OrgIcon, PersonIcon, TeamIcon } from "../../_components/field-icons";
import { PasswordField } from "../../_components/password-field";
import { TerminalState } from "../../_components/terminal-state";
import { TextField } from "../../_components/text-field";
import {
  acceptInviteAction,
  type InviteFormState,
  type InviteTerminalKind,
} from "./actions";

type InviteFormViewProps = {
  preview: InvitationPreview;
  state: InviteFormState;
  action: (formData: FormData) => void;
};

const terminalCopy: Record<InviteTerminalKind, { heading: string; message: string; buttonLabel: string }> = {
  invalid: {
    heading: "Invitation not found",
    message: "This invitation link is not valid. Ask an admin to send a new invitation.",
    buttonLabel: "Back to sign in",
  },
  expired: {
    heading: "This invitation has expired",
    message: "This invitation can no longer be used. Ask an admin to send a fresh invitation.",
    buttonLabel: "Back to sign in",
  },
  accepted: {
    heading: "This invitation was already accepted",
    message: "The account for this invitation has already been created. Sign in to continue.",
    buttonLabel: "Go to sign in",
  },
  revoked: {
    heading: "This invitation was revoked",
    message: "This invitation was cancelled by an admin and can no longer be used.",
    buttonLabel: "Back to sign in",
  },
};

function roleLabel(role: InvitationPreview["role"]) {
  return role === "admin" ? "Admin" : "Member";
}

export function InviteTerminalState({ kind }: { kind: InviteTerminalKind }) {
  const copy = terminalCopy[kind];
  return (
    <TerminalState
      heading={copy.heading}
      message={copy.message}
      buttonLabel={copy.buttonLabel}
      href="/login"
      tone={kind === "accepted" ? "success" : "warning"}
    />
  );
}

export function InviteFormView({ preview, state, action }: InviteFormViewProps) {
  if (state.status === "terminal") {
    return <InviteTerminalState kind={state.terminal} />;
  }

  return (
    <section className="grid gap-7">
      <div className="grid gap-3">
        <p className="font-mono text-xs uppercase text-a">Invitation</p>
        <h1 className="font-display text-3xl font-semibold text-text sm:text-4xl">Join {preview.orgName}.</h1>
        <p className="text-sm leading-6 text-dim">
          You have been invited to the {preview.teamName} team as {roleLabel(preview.role)}.
        </p>
      </div>

      <div className="grid gap-3 rounded-tile border border-border bg-surface/80 p-4">
        <div className="flex items-center gap-3 text-sm text-text">
          <OrgIcon className="h-4 w-4 text-a" />
          <span>{preview.orgName}</span>
        </div>
        <div className="flex items-center gap-3 text-sm text-text">
          <TeamIcon className="h-4 w-4 text-a" />
          <span>{preview.teamName} / {roleLabel(preview.role)}</span>
        </div>
      </div>

      <form action={action} className="grid gap-5">
        {state.error ? (
          <p role="alert" className="rounded-control border border-red/35 bg-red-soft px-4 py-3 text-sm font-semibold text-red">
            {state.error}
          </p>
        ) : null}

        <TextField
          label="Invited email"
          name="emailPreview"
          value={preview.email}
          readOnly
          icon={<EmailIcon className="h-4 w-4" />}
          hint="Locked to this invitation."
        />
        <TextField label="Display name" name="displayName" icon={<PersonIcon className="h-4 w-4" />} placeholder="Kai Morgan" />
        <TextField label="Username" name="username" autoComplete="username" required icon={<PersonIcon className="h-4 w-4" />} placeholder="kai" />
        <PasswordField name="password" autoComplete="new-password" required />

        <p className="text-xs font-medium leading-5 text-dim">
          You will be signed in automatically once your account is created.
        </p>
        <AuthButton type="submit" pendingLabel="Creating account...">Accept invitation</AuthButton>
      </form>
    </section>
  );
}

const initialInviteFormState: InviteFormState = { status: "idle" };

export function InviteForm({ token, preview }: { token: string; preview: InvitationPreview }) {
  const [state, formAction] = useActionState(
    acceptInviteAction.bind(null, token),
    initialInviteFormState,
  );
  return <InviteFormView preview={preview} state={state} action={formAction} />;
}
