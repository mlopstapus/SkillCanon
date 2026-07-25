const AGENTS = ["Claude Code", "Windsurf", "Cursor", "Copilot"];

export function TrustStrip() {
  return (
    <section className="mx-auto max-w-[1200px] px-6 pb-13 pt-5.5">
      <div className="flex flex-wrap items-center justify-center gap-8 font-mono text-[13px] text-faint">
        <span className="text-[11.5px] uppercase tracking-[.08em]">Distributes to</span>
        {AGENTS.map((agent) => (
          <span key={agent} className="text-dim">
            {agent}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 text-a">
          <span className="size-1.5 rounded-full bg-a" />
          any agent
        </span>
      </div>
    </section>
  );
}
