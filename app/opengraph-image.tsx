import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Muse — 1인 뷰티샵 인스타 광고 자동 생성";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #FFF5F8 0%, #FFE5EC 100%)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: "#F3498D",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontWeight: 900,
              fontSize: 40,
            }}
          >
            M
          </div>
          <div
            style={{
              color: "#F3498D",
              fontSize: 44,
              fontWeight: 900,
              letterSpacing: -1,
            }}
          >
            muse
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 84,
              fontWeight: 900,
              lineHeight: 1.05,
              letterSpacing: -3,
              color: "#1A1A1A",
            }}
          >
            1인 뷰티샵 인스타 광고,
            <br />
            <span style={{ color: "#F3498D" }}>1분에 받으세요.</span>
          </div>
          <div
            style={{
              fontSize: 30,
              color: "#767676",
              fontWeight: 500,
              lineHeight: 1.4,
            }}
          >
            AI가 가게 톤에 맞춘 광고 1장을 자동으로. 인스타 DM으로 받기.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            color: "#A8A8A8",
            fontSize: 22,
          }}
        >
          <span>헤어샵</span>
          <span>·</span>
          <span>네일</span>
          <span>·</span>
          <span>반영구</span>
          <span>·</span>
          <span>속눈썹</span>
          <span>·</span>
          <span>피부관리</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
