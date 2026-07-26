import { LogoMark, Wordmark } from "@/shared/ui";
import { DOCS_URL, NAV_ANCHOR_LINKS, QUICKSTART_HREF, REPO_URL } from "./sections";
import { ThemeToggle } from "./theme-toggle";

export function MarketingNav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-bg/72 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-3.5 px-6">
        <a href="#top" className="flex items-center gap-2.5">
          <LogoMark size={30} />
          <Wordmark className="text-[18px]" />
        </a>

        <div className="hidden items-center gap-1 lg:flex">
          {NAV_ANCHOR_LINKS.map((link) => (
            <a
              key={link.id}
              href={link.href}
              className="rounded-md px-2.25 py-1.75 text-[13px] text-dim transition-colors hover:text-text"
            >
              {link.label}
            </a>
          ))}
          <a
            href={DOCS_URL}
            target="_blank"
            rel="noopener"
            className="rounded-md px-2.25 py-1.75 text-[13px] text-dim transition-colors hover:text-text"
          >
            Docs
          </a>
        </div>

        <div className="flex items-center gap-2.5">
          <ThemeToggle />
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener"
            className="hidden items-center gap-2 rounded-tile border border-border px-3.25 py-2 font-mono text-[13px] text-dim transition-colors hover:border-border2 hover:text-text sm:flex"
          >
            GitHub
          </a>
          <a
            href={QUICKSTART_HREF}
            className="rounded-tile bg-a px-4 py-2.25 text-[13.5px] font-semibold text-a-fg shadow-glow transition-transform hover:-translate-y-0.5"
          >
            Deploy free
          </a>
        </div>
      </div>
    </nav>
  );
}
