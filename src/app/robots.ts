import type { MetadataRoute } from "next";

/** An internal tool: ask crawlers to stay out entirely. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
