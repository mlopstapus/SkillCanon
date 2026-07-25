// Shared nav-anchor/section table for the marketing landing page.
// See specs/014-marketing-landing-page/contracts/marketing-page-ui.md's
// Nav and Section contracts.

export interface NavAnchorLink {
  id: string;
  label: string;
  href: string;
}

export const NAV_ANCHOR_LINKS: NavAnchorLink[] = [
  { id: "how", label: "How it works", href: "#how" },
  { id: "governance", label: "Governance", href: "#governance" },
  { id: "features", label: "Features", href: "#features" },
  { id: "integrations", label: "Integrations", href: "#integrations" },
  { id: "quickstart", label: "Quickstart", href: "#quickstart" },
];

export const QUICKSTART_HREF = "#quickstart";

export const REPO_URL = "https://github.com/mlopstapus/SkillCanon";
export const DOCS_URL = `${REPO_URL}/tree/main/docs`;
