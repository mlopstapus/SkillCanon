"use client";

import Link from "next/link";
import { useActionState } from "react";
import { EmailIcon } from "../_components/field-icons";
import { AuthButton } from "../_components/auth-button";
import { PasswordField } from "../_components/password-field";
import { TextField } from "../_components/text-field";
import { loginAction, type LoginFormState } from "./actions";

type LoginFormViewProps = {
  state: LoginFormState;
  action: (formData: FormData) => void;
};

export function LoginFormView({ state, action }: LoginFormViewProps) {
  return (
    <section className="grid gap-7">
      <div className="grid gap-3">
        <p className="font-mono text-xs uppercase text-a">Sign in</p>
        <h1 className="font-display text-3xl font-semibold text-text sm:text-4xl">Welcome back.</h1>
        <p className="text-sm leading-6 text-dim">Use your SkillCanon account to enter the authenticated app.</p>
      </div>

      <form action={action} className="grid gap-5">
        {state.error ? (
          <p role="alert" className="rounded-control border border-red/35 bg-red-soft px-4 py-3 text-sm font-semibold text-red">
            {state.error}
          </p>
        ) : null}

        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          icon={<EmailIcon className="h-4 w-4" />}
          placeholder="admin@example.com"
        />
        <PasswordField name="password" autoComplete="current-password" required />
        <AuthButton type="submit" pendingLabel="Signing in...">Sign in</AuthButton>
      </form>

      <p className="text-sm text-dim">
        Setting up a new instance?{" "}
        <Link href="/register" className="font-semibold text-a hover:text-a-2">
          Run first-run setup -&gt;
        </Link>
      </p>
    </section>
  );
}

const initialLoginFormState: LoginFormState = {};

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, initialLoginFormState);
  return <LoginFormView state={state} action={formAction} />;
}
