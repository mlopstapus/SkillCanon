import Link from "next/link";

export type TerminalStateTone = "neutral" | "warning" | "success";

type TerminalStateProps = {
  heading: string;
  message: string;
  buttonLabel: string;
  href: string;
  tone?: TerminalStateTone;
};

const toneClass: Record<TerminalStateTone, string> = {
  neutral: "border-a/30 bg-a-soft text-a",
  warning: "border-red/35 bg-red-soft text-red",
  success: "border-green/35 bg-green-soft text-green",
};

export function TerminalState({
  heading,
  message,
  buttonLabel,
  href,
  tone = "neutral",
}: TerminalStateProps) {
  return (
    <section className="grid gap-6 text-center">
      <div
        aria-hidden="true"
        className={`mx-auto grid h-14 w-14 place-items-center rounded-full border ${toneClass[tone]}`}
      >
        <span className="font-mono text-lg font-semibold">!</span>
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
