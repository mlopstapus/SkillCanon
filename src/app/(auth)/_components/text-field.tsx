import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/shared/ui/utils";

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  icon: ReactNode;
  hint?: string;
  error?: string;
};

export function TextField({
  label,
  icon,
  hint,
  error,
  className,
  id,
  name,
  ...inputProps
}: TextFieldProps) {
  const inputId = id ?? name;
  const describedBy = [hint ? `${inputId}-hint` : null, error ? `${inputId}-error` : null]
    .filter(Boolean)
    .join(" ") || undefined;

  return (
    <label className="grid gap-2 text-sm font-semibold text-text" htmlFor={inputId}>
      <span>{label}</span>
      <span
        className={cn(
          "flex min-h-12 items-center gap-3 rounded-control border border-border bg-surface px-3 text-dim transition-colors focus-within:border-a focus-within:text-a focus-within:shadow-glow",
          error && "border-red text-red",
          inputProps.readOnly && "bg-raise text-faint",
          className,
        )}
      >
        <span className="shrink-0">{icon}</span>
        <input
          {...inputProps}
          id={inputId}
          name={name}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className="min-w-0 flex-1 bg-transparent py-3 text-[16px] text-text outline-none placeholder:text-faint read-only:cursor-not-allowed sm:text-sm"
        />
      </span>
      {hint ? (
        <span id={`${inputId}-hint`} className="text-xs font-medium text-dim">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={`${inputId}-error`} className="text-xs font-semibold text-red">
          {error}
        </span>
      ) : null}
    </label>
  );
}
