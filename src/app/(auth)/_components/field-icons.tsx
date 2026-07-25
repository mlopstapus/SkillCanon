type IconProps = {
  className?: string;
};

function FieldIconShell({ children, className }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-4 w-4"}
    >
      {children}
    </svg>
  );
}

export function EmailIcon(props: IconProps) {
  return (
    <FieldIconShell {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m4.5 7 7.5 6 7.5-6" />
    </FieldIconShell>
  );
}

export function PasswordIcon(props: IconProps) {
  return (
    <FieldIconShell {...props}>
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      <path d="M12 14v2" />
    </FieldIconShell>
  );
}

export function OrgIcon(props: IconProps) {
  return (
    <FieldIconShell {...props}>
      <path d="M4 20V6.5L12 3l8 3.5V20" />
      <path d="M9 20v-5h6v5" />
      <path d="M8 9h.01M12 9h.01M16 9h.01M8 12h.01M16 12h.01" />
    </FieldIconShell>
  );
}

export function TeamIcon(props: IconProps) {
  return (
    <FieldIconShell {...props}>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="10" r="2.25" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M14.5 17.5A4.5 4.5 0 0 1 21 20" />
    </FieldIconShell>
  );
}

export function PersonIcon(props: IconProps) {
  return (
    <FieldIconShell {...props}>
      <circle cx="12" cy="7.5" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </FieldIconShell>
  );
}
