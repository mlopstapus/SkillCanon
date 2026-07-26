import { LogoMark, Wordmark } from "@/shared/ui";
import { DOCS_URL, REPO_URL } from "./sections";

const LINKS = [
  { label: "Docs", href: DOCS_URL },
  { label: "GitHub", href: REPO_URL },
  { label: "API reference", href: "#" },
  { label: "Architecture", href: "#" },
];

export function Footer() {
  return (
    <footer className="border-t border-border bg-bg-2">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-5 px-6 py-9">
        <div className="flex items-center gap-2.5">
          <LogoMark size={26} />
          <Wordmark className="text-[15px]" />
          <span className="ml-2 font-mono text-[12.5px] text-faint">Apache-2.0</span>
        </div>
        <div className="flex gap-5.5 font-mono text-[13px] text-dim">
          {LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target={link.href.startsWith("http") ? "_blank" : undefined}
              rel={link.href.startsWith("http") ? "noopener" : undefined}
              className="transition-colors hover:text-text"
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
