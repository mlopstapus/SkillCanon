import { DOCS_URL, QUICKSTART_HREF } from "./sections";

export function FinalCta() {
  return (
    <section className="mx-auto max-w-[1200px] px-6 pb-20 pt-15 text-center">
      <h2 className="mb-5 font-display text-[38px] font-bold leading-[1.05] tracking-[-.035em] sm:text-[52px]">
        Ship prompts like
        <br />
        you ship code.
      </h2>
      <p className="mx-auto mb-7.5 max-w-[480px] text-[17px] leading-[1.6] text-dim">
        Open-source, self-hosted, and live in two minutes with Docker or Helm.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <a
          href={QUICKSTART_HREF}
          className="rounded-cta bg-a px-7 py-4 text-[15px] font-semibold text-a-fg shadow-glow transition-transform hover:-translate-y-0.5"
        >
          Deploy SkillCanon
        </a>
        <a
          href={DOCS_URL}
          target="_blank"
          rel="noopener"
          className="rounded-cta border border-border2 bg-surface px-6.5 py-4 text-[15px] font-semibold text-text transition-colors hover:bg-surface-2"
        >
          Read the docs
        </a>
      </div>
    </section>
  );
}
