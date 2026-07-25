import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#161618",
          borderRadius: 8,
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <rect x="3.5" y="3" width="3" height="18" rx="1.5" fill="#00e0b8" />
          <rect x="9" y="4.5" width="11" height="3" rx="1.5" fill="#f4f3f1" />
          <rect x="9" y="10.5" width="8" height="3" rx="1.5" fill="#f4f3f1" opacity="0.55" />
          <rect x="9" y="16.5" width="5" height="3" rx="1.5" fill="#f4f3f1" opacity="0.3" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
