import { LogoMark, Wordmark } from "@/shared/ui";

export function BrandRail() {
  return (
    <aside className="hidden min-h-screen border-r border-border bg-panel/80 px-10 py-10 lg:flex lg:flex-col lg:justify-between">
      <div className="grid gap-12">
        <div className="flex items-center gap-3">
          <LogoMark size={34} />
          <div>
            <Wordmark className="text-lg" />
            <p className="font-mono text-[11px] uppercase text-faint">Tribe</p>
          </div>
        </div>

        <div className="max-w-xl space-y-5">
          <p className="font-mono text-xs uppercase text-text">Skills registry</p>
          <h2 className="font-display text-5xl font-semibold leading-none text-text">
            One home for the skills we ship.
          </h2>
          <p className="max-w-lg text-base leading-7 text-dim">
            Tribe builders keep the skills their AI tools run here. Teams set the policies once, and every run follows them.
          </p>
        </div>

      </div>

      <footer className="grid gap-2 text-xs text-faint">
        <p>Internal to Tribe</p>
      </footer>
    </aside>
  );
}
