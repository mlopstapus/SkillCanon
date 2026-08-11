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

export function RegisterFormView({ state, action }: RegisterFormViewProps) {
  if (state.status === "blocked") {
    return (
      <TerminalState
        heading="This instance already has an organization"
        message="Self-hosted instances support exactly one organization for their entire lifetime, and this one already has an admin account. Sign in with that account to continue — registering again from here isn't possible."
        buttonLabel="Go to sign in"
        href="/login"
        tone="accent"
        icon={<ShieldCheckIcon className="h-6 w-6" />}
      />
    );
  }

  return (
    <section className="grid gap-7">
      <div className="grid gap-3">
        <p className="font-mono text-xs uppercase text-a">First-run setup</p>
        <h1 className="font-display text-3xl font-semibold text-text sm:text-4xl">Create your instance.</h1>
        <p className="text-sm leading-6 text-dim">Set up the organization, root team, and first admin account in one pass.</p>
      </div>

      <form action={action} className="grid gap-6">
        {state.error ? <ErrorBanner message={state.error} /> : null}

        <fieldset className="grid gap-4">
          <legend className="mb-1 font-display text-lg font-semibold text-text">Organization</legend>
          <TextField label="Organization name" name="orgName" required icon={<OrgIcon className="h-4 w-4" />} placeholder="Acme Ops" />
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
