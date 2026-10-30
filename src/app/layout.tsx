import type { Metadata } from "next";
import { brandFontFaceCss, hasBrandSymbol } from "@/shared/brand/assets";
import { THEME_INIT_SCRIPT } from "@/shared/ui";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "SkillCanon",
  description: "Self-hosted prompt registry distributed via MCP",
  robots: { index: false, follow: false },
};

// Reads BRAND_ASSETS_DIR per request (an operator can mount assets without a rebuild).
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const tribeSymbol = hasBrandSymbol();
  const tribeFonts = brandFontFaceCss() !== null;
  return (
    // suppressHydrationWarning: the init script sets data-theme before React hydrates.
    <html lang="en" data-brand={tribeSymbol ? "tribe" : undefined} suppressHydrationWarning>
      <head>
        {/* eslint-disable-next-line @next/next/no-css-tags -- generated per request from BRAND_ASSETS_DIR, not a build asset */}
        {tribeFonts ? <link rel="stylesheet" href="/brand/fonts.css" /> : null}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
