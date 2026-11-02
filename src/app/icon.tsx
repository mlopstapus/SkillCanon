import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { brandAssetsDir, hasBrandSymbol } from "@/shared/brand/assets";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

/** The Tribe symbol when brand assets are configured, otherwise the SkillCanon mark (ink tile, cyan bar). */
export default function Icon() {
  const dir = brandAssetsDir();
  if (dir && hasBrandSymbol(dir)) {
    const symbol = `data:image/svg+xml;base64,${readFileSync(join(dir, "logos", "symbol.svg")).toString("base64")}`;
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#fafaf8", borderRadius: 8 }}>
          <img src={symbol} width={17} height={20} alt="" />
        </div>
      ),
      { ...size },
    );
  }
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#06141b",
          borderRadius: 8,
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <rect x="3.5" y="3" width="3" height="18" rx="1.5" fill="#65d9ee" />
          <rect x="9" y="4.5" width="11" height="3" rx="1.5" fill="#fafaf8" />
          <rect x="9" y="10.5" width="8" height="3" rx="1.5" fill="#fafaf8" opacity="0.55" />
          <rect x="9" y="16.5" width="5" height="3" rx="1.5" fill="#fafaf8" opacity="0.3" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
