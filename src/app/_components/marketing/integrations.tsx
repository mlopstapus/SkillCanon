import { IntegrationTabs } from "./integration-tabs";

const CHECKLIST = [
  { label: "Claude Code", detail: "native skills · v1" },
  { label: "REST API", detail: "any agent" },
  { label: "CI / CD", detail: "scoped API keys" },
];

export function Integrations() {
  return (
    <section id="integrations" className="mx-auto max-w-[1200px] px-6 py-15">
      <div className="grid grid-cols-1 items-center gap-11 lg:grid-cols-[.9fr_1.1fr]">
        <div>
          <div className="mb-3.5 font-mono text-[12.5px] uppercase tracking-[.1em] text-a">
            Integrations
          </div>
          <h2
            id="quickstart"
            className="mb-4 scroll-mt-20 font-display text-[28px] font-bold leading-[1.1] tracking-[-.03em] sm:text-[36px]"
          >
            One command. Skills everywhere.
          </h2>
          <p className="mb-5.5 text-[16px] leading-[1.65] text-dim">
            Run <span className="font-mono text-text">skillcanon init</span> once. A
            SessionStart hook keeps{" "}
            <span className="font-mono text-text">.claude/skills/</span> in sync with your
            project, and every skill resolves live — policies and objectives injected fresh on
            each run.
          </p>
          <div className="flex flex-col gap-2.5">
            {CHECKLIST.map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-2.75 rounded-tile border border-border bg-surface px-3.5 py-3"
              >
                <span className="font-mono text-[13px] text-a">✓</span>
                <span className="text-[14px] font-semibold">{item.label}</span>
                <span className="font-mono text-[12.5px] text-faint">{item.detail}</span>
              </div>
            ))}
          </div>
        </div>

        <IntegrationTabs />
      </div>
    </section>
  );
}
