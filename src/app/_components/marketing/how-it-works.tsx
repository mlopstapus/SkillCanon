const STEPS = [
  {
    n: "01",
    title: "Define",
    body: "Version Jinja2 prompt templates with input schemas, tags, and deprecation.",
  },
  {
    n: "02",
    title: "Govern",
    body: "Attach policies & objectives to teams. They cascade down the hierarchy automatically.",
  },
  {
    n: "03",
    title: "Distribute",
    body: "Every prompt syncs into .claude/skills/ as a native skill your agent triggers by name.",
  },
  {
    n: "04",
    title: "Expand",
    body: "On each run, policy is resolved fresh into the skill — the agent's own LLM does the work.",
    accent: true,
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="mx-auto max-w-[1200px] px-6 py-15">
      <div className="mb-13 text-center">
        <div className="mb-3.5 font-mono text-[12.5px] uppercase tracking-[.1em] text-a">
          The flow
        </div>
        <h2 className="mb-3 font-display text-[32px] font-bold tracking-[-.03em] sm:text-[40px]">
          One definition. Every tool. Governed.
        </h2>
        <p className="mx-auto max-w-[560px] text-[16.5px] leading-[1.6] text-dim">
          SkillCanon sits between your prompt library and your developers&apos; coding agents —
          resolving policy live, the moment a skill runs.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4.5 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step) => (
          <div
            key={step.n}
            className={`rounded-card border p-5.5 ${
              step.accent ? "border-border2 bg-a-soft" : "border-border bg-surface"
            }`}
          >
            <div className="mb-4 font-mono text-[12px] text-a">{step.n}</div>
            <h3 className="mb-2 font-display text-[18px] font-semibold">{step.title}</h3>
            <p className="text-[13.5px] leading-[1.55] text-dim">{step.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
