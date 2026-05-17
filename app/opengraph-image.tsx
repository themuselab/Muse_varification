import { ImageResponse } from "next/og";

export const alt = "Muse — 1인 뷰티샵 인스타 광고 자동 생성";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PRETENDARD_BOLD =
  "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/Pretendard-Bold.otf";
const PRETENDARD_REGULAR =
  "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/Pretendard-Regular.otf";

export default async function OG() {
  const [boldData, regularData] = await Promise.all([
    fetch(PRETENDARD_BOLD).then((r) => r.arrayBuffer()),
    fetch(PRETENDARD_REGULAR).then((r) => r.arrayBuffer()),
  ]);

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
          fontFamily: "Pretendard",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
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
              fontWeight: 700,
              fontSize: 40,
            }}
          >
            M
          </div>
          <div
            style={{
              color: "#F3498D",
              fontSize: 44,
              fontWeight: 700,
              letterSpacing: -1,
            }}
          >
            muse
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 84,
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: -3,
              color: "#1A1A1A",
            }}
          >
            <div>1인 뷰티샵 인스타 광고,</div>
            <div style={{ color: "#F3498D" }}>DM으로 받으세요.</div>
          </div>
          <div
            style={{
              fontSize: 30,
              color: "#767676",
              fontWeight: 400,
              lineHeight: 1.4,
            }}
          >
            AI가 가게 톤에 맞춘 광고 1장. 신청 순서대로 인스타 DM으로.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            color: "#A8A8A8",
            fontSize: 22,
            fontWeight: 400,
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
    {
      ...size,
      fonts: [
        {
          name: "Pretendard",
          data: boldData,
          weight: 700,
          style: "normal",
        },
        {
          name: "Pretendard",
          data: regularData,
          weight: 400,
          style: "normal",
        },
      ],
    },
  );
}
