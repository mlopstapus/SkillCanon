import { HeroPanel } from "./hero-panel";

export function Hero() {
  return (
    <header className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-14 px-6 pb-10 pt-20 lg:grid-cols-[1.02fr_1.1fr]">
      <div>
        <div className="mb-6 inline-flex items-center gap-2 rounded-pill border border-border2 bg-surface px-3 py-1.5 text-[12.5px] text-dim">
          <span className="rounded-pill bg-a-soft px-2 py-0.5 font-mono text-[11px] font-semibold text-a">
            OSS
          </span>
          Self-hosted prompt control plane
        </div>
        <h1 className="mb-5 font-display text-[44px] font-bold leading-[1.03] tracking-[-.035em] sm:text-[60px]">
          Govern every prompt
          <br />
          your engineers ship.
        </h1>
        <p className="mb-8 max-w-[520px] text-[18px] leading-[1.6] text-dim">
          Define prompts once, publish them as native skills to every coding agent through one
          API, and enforce org-wide policy automatically —{" "}
          <span className="text-text">resolved live, at the source</span>. SkillCanon never calls
          an LLM.
        </p>
        <div className="mb-7 flex flex-wrap gap-3">
          <a
            href="#quickstart"
            className="rounded-cta bg-a px-6 py-3.5 text-[15px] font-semibold text-a-fg shadow-glow transition-transform hover:-translate-y-0.5"
          >
            Deploy in 2 minutes
          </a>
          <a
            href="#how"
            className="rounded-cta border border-border2 bg-surface px-5.5 py-3.5 text-[15px] font-semibold text-text transition-colors hover:bg-surface-2"
          >
            See how it works
          </a>
        </div>
        <div className="flex items-center gap-4 font-mono text-[12.5px] text-faint">
          <span>Apache-2.0</span>
          <span className="opacity-40">/</span>
          <span>SOC2 · NIST aligned</span>
          <span className="opacity-40">/</span>
          <span>Docker · Helm</span>
        </div>
      </div>

      <HeroPanel />
    </header>
  );
}
