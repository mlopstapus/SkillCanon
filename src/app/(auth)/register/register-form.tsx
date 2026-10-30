"use client";

import Link from "next/link";
import { useActionState } from "react";
import { EmailIcon, OrgIcon, PersonIcon, ShieldCheckIcon, TeamIcon } from "../_components/field-icons";
import { AuthButton } from "../_components/auth-button";
import { ErrorBanner } from "../_components/error-banner";
import { PasswordField } from "../_components/password-field";
import { TerminalState } from "../_components/terminal-state";
import { TextField } from "../_components/text-field";
import { registerAction, type RegisterFormState } from "./actions";

type RegisterFormViewProps = {
  state: RegisterFormState;
  action: (formData: FormData) => void;
};

/** Shown instead of the form once the instance has its organization: joining is by invitation only. */
export function InviteOnlyNotice() {
  return (
    <TerminalState
      heading="Access is by invitation"
      message="This instance already has its organization. Ask an admin to send you an invitation, then use the link in it to join. If you already have an account, sign in."
      buttonLabel="Go to sign in"
      href="/login"
      tone="accent"
      icon={<ShieldCheckIcon className="h-6 w-6" />}
    />
  );
}

export function RegisterFormView({ state, action }: RegisterFormViewProps) {
  if (state.status === "blocked") {
    return <InviteOnlyNotice />;
  }

  return (
    <section className="grid gap-7">
      <div className="grid gap-3">
        <p className="font-caption text-xs uppercase text-text">First-run setup</p>
        <h1 className="font-display text-3xl font-semibold text-text sm:text-4xl">Set up SkillCanon for Tribe.</h1>
        <p className="text-sm leading-6 text-dim">Create the Tribe organization, its root team and the first admin. After this, access is by invitation.</p>
      </div>

      <form action={action} className="grid gap-6">
        {state.error ? <ErrorBanner message={state.error} /> : null}

        <fieldset className="grid gap-4">
          <legend className="mb-1 font-display text-lg font-semibold text-text">Organization</legend>
          <TextField label="Organization name" name="orgName" defaultValue="Tribe" required icon={<OrgIcon className="h-4 w-4" />} placeholder="Acme Ops" />
          <TextField label="Root team name" name="teamName" required icon={<TeamIcon className="h-4 w-4" />} placeholder="Platform" />
        </fieldset>

        <fieldset className="grid gap-4">
          <legend className="mb-1 font-display text-lg font-semibold text-text">Admin account</legend>
          <TextField label="Display name" name="displayName" required icon={<PersonIcon className="h-4 w-4" />} placeholder="Jane Doe" />
          <TextField label="Username" name="username" autoComplete="username" required icon={<PersonIcon className="h-4 w-4" />} placeholder="jane" />
          <TextField label="Email" name="email" type="email" autoComplete="email" required icon={<EmailIcon className="h-4 w-4" />} placeholder="jane@example.com" />
          <PasswordField
            name="password"
            autoComplete="new-password"
            required
            hint="Minimum 8 characters. Hashed with bcrypt - never stored in plain text."
          />
        </fieldset>

        <AuthButton type="submit" pendingLabel="Creating instance...">Create instance</AuthButton>
      </form>

      <p className="text-sm text-dim">
        Already set up?{" "}
        <Link href="/login" className="font-semibold text-a hover:text-a-2">
          Sign in -&gt;
        </Link>
      </p>
    </section>
  );
}

const initialRegisterFormState: RegisterFormState = { status: "idle" };

export function RegisterForm() {
  const [state, formAction] = useActionState(registerAction, initialRegisterFormState);
  return <RegisterFormView state={state} action={formAction} />;
}
