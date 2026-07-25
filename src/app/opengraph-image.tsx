import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: 80,
          background: "#0b0b0c",
          color: "#f4f3f1",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 40,
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "#1d1d20",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
              <rect x="3.5" y="3" width="3" height="18" rx="1.5" fill="#00e0b8" />
              <rect x="9" y="4.5" width="11" height="3" rx="1.5" fill="#f4f3f1" />
              <rect x="9" y="10.5" width="8" height="3" rx="1.5" fill="#f4f3f1" opacity="0.55" />
              <rect x="9" y="16.5" width="5" height="3" rx="1.5" fill="#f4f3f1" opacity="0.3" />
            </svg>
          </div>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 700 }}>
            Skill<span style={{ color: "#00e0b8" }}>Canon</span>
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 56, fontWeight: 700, lineHeight: 1.1, maxWidth: 980 }}>
          Govern every prompt your engineers ship.
        </div>
        <div style={{ display: "flex", fontSize: 26, color: "#9b9a96", marginTop: 28, maxWidth: 900 }}>
          Self-hosted prompt control plane. SkillCanon never calls an LLM.
        </div>
      </div>
    ),
    { ...size },
  );
}
