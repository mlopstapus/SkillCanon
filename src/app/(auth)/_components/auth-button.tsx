"use client";

import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/shared/ui/utils";

type AuthButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
  pendingLabel?: string;
};

export function AuthButton({
  children,
  className,
  disabled,
  pendingLabel = "Working...",
  variant = "primary",
  ...props
}: AuthButtonProps) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;

  return (
    <button
      {...props}
      disabled={isDisabled}
      className={cn(
        "relative inline-flex min-h-12 w-full items-center justify-center overflow-hidden rounded-cta px-5 text-sm font-bold transition duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-a disabled:cursor-wait disabled:opacity-70",
        variant === "primary"
          ? "bg-a text-a-fg shadow-glow before:absolute before:inset-y-0 before:left-0 before:w-1/3 before:-translate-x-full before:bg-white/35 before:blur-md hover:bg-a-2 hover:before:animate-sheen"
          : "border border-border-2 bg-transparent text-text hover:border-a hover:text-a",
        className,
      )}
    >
      <span className="relative z-10">{pending ? pendingLabel : children}</span>
    </button>
  );
}
