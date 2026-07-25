const PRINCIPLES = [
  {
    title: "Prepend · Append · Inject",
    body: "Three enforcement modes, applied by priority into the prompt itself.",
  },
  {
    title: "Full auditability",
    body: "applied_policies + objectives on every response.",
  },
  {
    title: "Project overlays",
    body: "Layer cross-team project policy on top of the hierarchy.",
  },
];

const RESOLUTION_ROWS = [
  { level: "Org", policy: "soc2-controls", state: "inherited", indent: 0 },
  { level: "Engineering", policy: "always-write-tests", state: "inherited", indent: 1 },
  { level: "MLOps", policy: "pin-model-version", state: "local ✎", indent: 2, active: true },
];

export function Governance() {
  return (
    <section id="governance" className="mx-auto max-w-[1200px] px-6 py-15">
      <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-2">
        <div>
          <div className="mb-3.5 font-mono text-[12.5px] uppercase tracking-[.1em] text-a">
            Governance model
          </div>
          <h2 className="mb-4.5 font-display text-[30px] font-bold leading-[1.08] tracking-[-.03em] sm:text-[38px]">
            Two-layer inheritance,
            <br />
            enforced at the source.
          </h2>
          <p className="mb-6 text-[16px] leading-[1.65] text-dim">
            Policies cascade down a recursive team tree. Everything above you is{" "}
            <span className="text-text">inherited and immutable</span>; your level is{" "}
            <span className="text-text">local and mutable</span>. Every expansion returns exactly
            which policies and objectives were applied.
          </p>
          <div className="flex flex-col gap-3">
            {PRINCIPLES.map((principle) => (
              <div key={principle.title} className="flex items-start gap-3">
                <span className="mt-0.5 text-a">◆</span>
                <div>
                  <div className="text-[14.5px] font-semibold">{principle.title}</div>
                  <div className="text-[13px] text-dim">{principle.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative overflow-hidden rounded-tile border border-border2 bg-bg-2 p-6.5">
          <div className="mb-4.5 font-mono text-[12.5px] text-faint">
            policy resolution · alice@mlops
          </div>
          <div className="flex flex-col gap-2.25">
            {RESOLUTION_ROWS.map((row) => (
              <div
                key={row.level}
                style={{ marginLeft: row.indent * 20 }}
                className={`flex items-center gap-3 rounded-tile border px-3.25 py-2.75 ${
                  row.active ? "border-a/45 bg-a-soft" : "border-border bg-surface"
                }`}
              >
                <span
                  className={`w-19.5 font-mono text-[11px] ${row.active ? "text-a" : "text-faint"}`}
                >
                  {row.level}
                </span>
                <span
                  className={`flex-1 font-mono text-[12.5px] ${row.active ? "text-text" : "text-dim"}`}
                >
                  {row.policy}
                </span>
                <span className="font-mono text-[10px] text-a">{row.state}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 border-t border-border pt-4 font-mono text-[11.5px] text-faint">
            → 3 policies · 2 objectives applied
          </div>
        </div>
      </div>
    </section>
  );
}
