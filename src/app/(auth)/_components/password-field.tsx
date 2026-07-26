"use client";

import { useState } from "react";
import type { InputHTMLAttributes } from "react";
import { PasswordIcon } from "./field-icons";
import { TextField } from "./text-field";

type PasswordFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label?: string;
  hint?: string;
  error?: string;
};

export function PasswordField({ label = "Password", hint, error, ...inputProps }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <TextField
      {...inputProps}
      label={label}
      type={visible ? "text" : "password"}
      icon={<PasswordIcon className="h-4 w-4" />}
      hint={hint}
      error={error}
      trailing={
        <button
          type="button"
          className="font-mono text-[11px] font-medium text-faint transition-colors hover:text-a focus:outline-none focus-visible:ring-2 focus-visible:ring-a"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? "hide" : "show"}
        </button>
      }
    />
  );
}
