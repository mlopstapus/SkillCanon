// Per FR-014: stat-tile wording is softened to alignment/intent language —
// never a formal-certification claim the product doesn't yet hold.
const STATS = [
  { value: "SOC2", label: "Built for SOC2" },
  { value: "NIST", label: "NIST-aligned controls" },
  { value: "100%", label: "self-hosted" },
  { value: "0", label: "LLM calls made" },
];

export function ComplianceCta() {
  return (
    <section className="mx-auto max-w-[1200px] px-6 pb-7.5 pt-10">
      <div className="grid grid-cols-1 items-center gap-10 rounded-cta border border-border2 bg-bg-2 p-11 lg:grid-cols-[1.1fr_.9fr]">
        <div>
          <div className="mb-3.5 font-mono text-[12.5px] uppercase tracking-[.1em] text-a">
            For engineering leaders
          </div>
          <h2 className="mb-3.5 font-display text-[26px] font-bold leading-[1.1] tracking-[-.03em] sm:text-[34px]">
            Compliance you can prove, not promise.
          </h2>
          <p className="text-[15.5px] leading-[1.65] text-dim">
            Self-hosted, so prompts and keys never leave your infra. Policy is enforced in-band
            and every resolution is auditable. SkillCanon never calls an LLM — there&apos;s no
            model to leak to.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {STATS.map((stat) => (
            <div key={stat.label} className="rounded-tile border border-border bg-surface p-4">
              <div className="font-display text-[22px] font-bold text-a">{stat.value}</div>
              <div className="mt-1 text-[12.5px] text-dim">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
