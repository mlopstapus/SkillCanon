const features = [
  "Self-hosted prompt registry",
  "Tenant-aware teams and access",
  "Policy controls before agents run",
];

export function BrandRail() {
  return (
    <aside className="hidden min-h-screen border-r border-border bg-panel/80 px-10 py-10 lg:flex lg:flex-col lg:justify-between">
      <div className="grid gap-12">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-tile border border-a/35 bg-a-soft text-a shadow-glow">
            <span className="font-display text-xl font-bold">S</span>
          </div>
          <div>
            <p className="font-display text-lg font-semibold text-text">SkillCanon</p>
            <p className="font-mono text-[11px] uppercase text-faint">Prompt control plane</p>
          </div>
        </div>

        <div className="max-w-xl space-y-5">
          <p className="font-mono text-xs uppercase text-a">Prompt control plane</p>
          <h2 className="font-display text-5xl font-semibold leading-none text-text">
            Govern access before the first prompt ships.
          </h2>
          <p className="max-w-lg text-base leading-7 text-dim">
            Bring teams, invitations, sessions, and policy-ready identity into one self-hosted control surface.
          </p>
        </div>

        <ul className="grid max-w-md gap-3">
          {features.map((feature) => (
            <li key={feature} className="flex items-center gap-3 rounded-tile border border-border bg-surface/80 px-4 py-3 text-sm text-text">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-a shadow-glow" />
              {feature}
            </li>
          ))}
        </ul>
      </div>

      <footer className="grid gap-2 text-xs text-faint">
        <p>Apache-2.0 / self-hosted</p>
        <p>v0.1 Identity & Access</p>
      </footer>
    </aside>
  );
}
