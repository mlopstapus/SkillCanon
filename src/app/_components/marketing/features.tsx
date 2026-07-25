const FEATURES = [
  {
    title: "Prompt Registry",
    body: "Versioned templates with input schemas, tags, deprecation, and composition via include_prompt().",
  },
  {
    title: "Skill Distribution",
    body: "Every prompt installs as a native skill via the skillcanon CLI — triggered by name, resolved live over the API.",
  },
  {
    title: "Hierarchical Teams",
    body: "A recursive team tree with users, enabling org-wide governance from a single root.",
  },
  {
    title: "Policy Enforcement",
    body: "Prepend, append, or inject — applied automatically during expansion, by priority.",
  },
  {
    title: "Objective Tracking",
    body: "Team & user objectives surface alongside every expanded prompt, inherited down the tree.",
  },
  {
    title: "Workflows",
    body: "Compose multi-step prompt pipelines — chained entrypoints like sh-new → sh-finish.",
  },
];

export function Features() {
  return (
    <section id="features" className="mx-auto max-w-[1200px] px-6 py-15">
      <div className="mb-10">
        <div className="mb-3.5 font-mono text-[12.5px] uppercase tracking-[.1em] text-a">
          Platform
        </div>
        <h2 className="max-w-[560px] font-display text-[32px] font-bold tracking-[-.03em] sm:text-[40px]">
          Everything a prompt platform team needs.
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <div
            key={feature.title}
            className="rounded-card border border-border bg-surface p-6 transition-[border-color,transform] duration-200 hover:-translate-y-0.75 hover:border-border2"
          >
            <div className="mb-4 grid size-9.5 place-items-center rounded-tile bg-a-soft text-a">
              ✳
            </div>
            <h3 className="mb-1.75 font-display text-[18px] font-semibold">{feature.title}</h3>
            <p className="text-[13.5px] leading-[1.55] text-dim">{feature.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
