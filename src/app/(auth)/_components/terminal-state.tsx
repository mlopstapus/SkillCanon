import Link from "next/link";
import type { ReactNode } from "react";

export type TerminalStateTone = "accent" | "neutral" | "success" | "danger";

type TerminalStateProps = {
  heading: string;
  message: string;
  buttonLabel: string;
  href: string;
  tone?: TerminalStateTone;
  icon?: ReactNode;
};

const toneClass: Record<TerminalStateTone, string> = {
  accent: "border-a/35 bg-a-soft text-a",
  neutral: "border-border-2 bg-surface-2 text-dim",
  success: "border-green/35 bg-green-soft text-green",
  danger: "border-red/35 bg-red-soft text-red",
};

function DefaultIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5.5M12 16.5h.01" />
    </svg>
  );
}

export function TerminalState({
  heading,
  message,
  buttonLabel,
  href,
  tone = "neutral",
  icon,
}: TerminalStateProps) {
  return (
    <section className="grid gap-6 text-center">
      <div
        aria-hidden="true"
        className={`mx-auto grid h-14 w-14 place-items-center rounded-2xl border ${toneClass[tone]}`}
      >
        {icon ?? <DefaultIcon />}
      </div>
      <div className="grid gap-3">
        <h1 className="font-display text-3xl font-semibold text-text sm:text-4xl">{heading}</h1>
        <p className="mx-auto max-w-md text-sm leading-6 text-dim">{message}</p>
      </div>
      <Link
        href={href}
        className="inline-flex min-h-12 items-center justify-center rounded-cta bg-a px-5 text-sm font-bold text-a-fg shadow-glow transition hover:bg-a-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-a"
      >
        {buttonLabel}
      </Link>
    </section>
  );
}
