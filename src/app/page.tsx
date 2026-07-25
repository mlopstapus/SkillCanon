import type { Metadata } from "next";
import { ComplianceCta } from "./_components/marketing/compliance-cta";
import { Features } from "./_components/marketing/features";
import { FinalCta } from "./_components/marketing/final-cta";
import { Footer } from "./_components/marketing/footer";
import { Governance } from "./_components/marketing/governance";
import { Hero } from "./_components/marketing/hero";
import { HowItWorks } from "./_components/marketing/how-it-works";
import { Integrations } from "./_components/marketing/integrations";
import { MarketingNav } from "./_components/marketing/marketing-nav";
import { MarketingShell } from "./_components/marketing/marketing-shell";
import { Reveal } from "./_components/marketing/reveal";
import { TrustStrip } from "./_components/marketing/trust-strip";

const TITLE = "SkillCanon — Govern every prompt your engineers ship";
const DESCRIPTION =
  "Define prompts once, publish them as native skills to every coding agent through one API, and enforce org-wide policy automatically. Self-hosted, SOC2-aligned, and SkillCanon never calls an LLM.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function Home() {
  return (
    <MarketingShell>
      <MarketingNav />
      <div id="top" />
      <Reveal>
        <Hero />
      </Reveal>
      <Reveal>
        <TrustStrip />
      </Reveal>
      <Reveal>
        <HowItWorks />
      </Reveal>
      <Reveal>
        <Governance />
      </Reveal>
      <Reveal>
        <Features />
      </Reveal>
      <Reveal>
        <Integrations />
      </Reveal>
      <Reveal>
        <ComplianceCta />
      </Reveal>
      <Reveal>
        <FinalCta />
      </Reveal>
      <Footer />
    </MarketingShell>
  );
}
