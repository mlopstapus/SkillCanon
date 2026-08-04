import type { ReactNode } from "react";
import { cn } from "./utils";

export type AppStateVariant = "empty" | "loading" | "error";

export interface AppStateProps {
  variant: AppStateVariant;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}

const VARIANT_STYLES: Record<AppStateVariant, { label: string; iconClassName: string; icon: ReactNode }> = {
  empty: {
    label: "Empty state",
    iconClassName: "border-a/35 bg-a-soft text-a",
    icon: <span aria-hidden>0</span>,
  },
  loading: {
    label: "Loading state",
    iconClassName: "border-a/35 bg-a-soft text-a",
    icon: <span aria-hidden className="size-4 rounded-full border-2 border-a/30 border-t-a animate-spin-sc" />,
  },
  error: {
    label: "Error state",
    iconClassName: "border-red/35 bg-red-soft text-red",
    icon: <span aria-hidden>!</span>,
  },
};

export function AppState({ variant, title, description, action, className }: AppStateProps) {
  const styles = VARIANT_STYLES[variant];
  const role = variant === "error" ? "alert" : "status";

  return (
    <section
      role={role}
      aria-live="polite"
      className={cn(
        "mx-auto flex w-full max-w-[460px] flex-col items-center justify-center px-6 py-16 text-center",
        className,
      )}
    >
      <div
        className={cn(
          "mb-3.5 grid size-10 place-items-center rounded-tile border font-mono text-[13px] font-semibold",
          styles.iconClassName,
        )}
      >
        {styles.icon}
      </div>
      <p className="mb-2 font-mono text-[10.5px] tracking-[0.12em] text-faint uppercase">
        {styles.label}
      </p>
      <h2 className="font-display text-[16px] font-semibold text-text">{title}</h2>
      <p className="mt-2 max-w-[400px] text-[12.5px] leading-relaxed text-dim">
        {description}
      </p>
      {action ? <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </section>
  );
}
