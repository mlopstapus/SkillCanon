import { cn } from "./utils";

type LogoMarkProps = {
  size?: number;
  className?: string;
};

/** The SkillCanon brand mark: an accent bar plus three descending bars, per the design system. */
export function LogoMark({ size = 34, className }: LogoMarkProps) {
  const iconSize = Math.round((size * 19) / 34);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-tile border border-border-2 bg-surface-2",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
        <rect x="3.5" y="3" width="3" height="18" rx="1.5" className="fill-a" />
        <rect x="9" y="4.5" width="11" height="3" rx="1.5" className="fill-text" />
        <rect x="9" y="10.5" width="8" height="3" rx="1.5" className="fill-text" opacity="0.55" />
        <rect x="9" y="16.5" width="5" height="3" rx="1.5" className="fill-text" opacity="0.3" />
      </svg>
    </span>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-display font-bold tracking-[-0.02em] text-text", className)}>
      Skill<span className="text-a">Canon</span>
    </span>
  );
}
