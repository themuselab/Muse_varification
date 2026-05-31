"use client";

import { useEffect, useState } from "react";

type Stats = {
  date: string;
  byEvent: Record<string, number>;
  byVariant: { A: Record<string, number>; B: Record<string, number> };
  avgDwellMs: { A: number; B: number };
  ctr: { A: number; B: number; overall: number };
};

const EVENTS: Array<{ key: string; label: string }> = [
  { key: "session_start", label: "세션 시작" },
  { key: "deeplink_open", label: "푸시 → 진입" },
  { key: "impression", label: "알림 노출" },
  { key: "alert_click", label: "알림 클릭" },
  { key: "pin_click", label: "핀 클릭" },
  { key: "missed_view", label: "모달 본 수" },
];

function fmtPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}
function fmtMs(ms: number) {
  if (!ms) return "—";
  return `${(ms / 1000).toFixed(1)}초`;
}

export default function AdminTrack() {
  const [date, setDate] = useState<string>("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchStats = async (d?: string) => {
    setLoading(true);
    setError("");
    try {
      const url = d
        ? `/api/track?stats=1&date=${d}`
        : `/api/track?stats=1`;
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as Stats;
      setStats(data);
      if (!d) setDate(data.date);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats(date || undefined);
  }, [date]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => fetchStats(date || undefined), 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, date]);

  const A = stats?.byVariant.A;
  const B = stats?.byVariant.B;

  return (
    <div
      style={{
        fontFamily:
          "Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
        background: "#f5f5f7",
        minHeight: "100vh",
        padding: "24px 16px 80px 16px",
      }}
    >
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 22,
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 9,
              background: "#ec4899",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
            }}
          >
            뮤
          </div>
          <div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: "#1f1f1f",
                letterSpacing: -0.3,
              }}
            >
              뮤즈 검증 데이터
            </div>
            <div style={{ fontSize: 12, color: "#9e9e9e", marginTop: 2 }}>
              앱인토스 mock A/B 검증 · {stats?.date || "..."}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 18,
            flexWrap: "wrap",
          }}
        >
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{
              padding: "8px 12px",
              fontSize: 13,
              border: "1px solid #e5e5e5",
              borderRadius: 8,
              background: "white",
              fontFamily: "inherit",
            }}
          />
          <button
            onClick={() => fetchStats(date || undefined)}
            style={{
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 600,
              border: 0,
              borderRadius: 8,
              background: "#ec4899",
              color: "white",
              cursor: "pointer",
            }}
          >
            새로고침
          </button>
          <button
            onClick={async () => {
              const secret = prompt(
                "관리자 토큰 (CRON_SECRET) 입력:\n취소 누르면 중단",
              );
              if (!secret) return;
              const scope = date ? `${date} 데이터` : "전체 데이터";
              if (
                !confirm(
                  `${scope}를 정말 초기화할까요?\n이 작업은 되돌릴 수 없어요.`,
                )
              )
                return;
              try {
                const url = date
                  ? `/api/track?date=${date}`
                  : `/api/track`;
                const r = await fetch(url, {
                  method: "DELETE",
                  headers: { Authorization: `Bearer ${secret}` },
                });
                if (!r.ok) {
                  const t = await r.text();
                  alert(`실패 (${r.status}): ${t.slice(0, 200)}`);
                  return;
                }
                const data = await r.json();
                alert(
                  `초기화 완료 — ${data.deleted}개 키 삭제 (범위: ${data.scope})`,
                );
                fetchStats(date || undefined);
              } catch (e) {
                alert("요청 실패: " + (e instanceof Error ? e.message : String(e)));
              }
            }}
            style={{
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 600,
              border: "1px solid #dc2626",
              borderRadius: 8,
              background: "white",
              color: "#dc2626",
              cursor: "pointer",
            }}
          >
            데이터 초기화
          </button>
          <label
            style={{
              fontSize: 12,
              color: "#666",
              display: "flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            30초 자동 새로고침
          </label>
          {loading && (
            <span style={{ fontSize: 12, color: "#9e9e9e" }}>불러오는 중…</span>
          )}
          {error && (
            <span style={{ fontSize: 12, color: "#dc2626" }}>{error}</span>
          )}
        </div>

        {stats && (
          <>
            {/* CTR 카드 — 핵심 KPI */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 12,
                marginBottom: 18,
              }}
            >
              <KpiCard
                label="전체 CTR"
                value={fmtPct(stats.ctr.overall)}
                sub={`${stats.byEvent.alert_click} / ${stats.byEvent.impression}`}
              />
              <KpiCard
                label="A안 CTR (할인 강조)"
                value={fmtPct(stats.ctr.A)}
                sub={`${A?.alert_click ?? 0} / ${A?.impression ?? 0}`}
                accent
              />
              <KpiCard
                label="B안 CTR (한정 강조)"
                value={fmtPct(stats.ctr.B)}
                sub={`${B?.alert_click ?? 0} / ${B?.impression ?? 0}`}
                accent
              />
              <KpiCard
                label="푸시 → 진입"
                value={`${stats.byEvent.deeplink_open}건`}
                sub={`전체 세션 ${stats.byEvent.session_start}`}
              />
            </div>

            {/* A/B 비교 표 */}
            <div
              style={{
                background: "white",
                borderRadius: 12,
                padding: 18,
                marginBottom: 18,
                border: "1px solid #ededed",
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#1f1f1f",
                  marginBottom: 12,
                }}
              >
                A vs B 카피 비교
              </div>
              <table
                style={{
                  width: "100%",
                  fontSize: 12,
                  borderCollapse: "collapse",
                }}
              >
                <thead>
                  <tr style={{ borderBottom: "1px solid #ededed" }}>
                    <th style={th}>이벤트</th>
                    <th style={th}>A (할인)</th>
                    <th style={th}>B (한정)</th>
                    <th style={th}>합계</th>
                  </tr>
                </thead>
                <tbody>
                  {EVENTS.map((e) => (
                    <tr key={e.key} style={{ borderBottom: "1px solid #f5f5f5" }}>
                      <td style={td}>{e.label}</td>
                      <td style={tdNum}>{A?.[e.key] ?? 0}</td>
                      <td style={tdNum}>{B?.[e.key] ?? 0}</td>
                      <td style={{ ...tdNum, fontWeight: 700 }}>
                        {stats.byEvent[e.key] ?? 0}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background: "#fdf2f8" }}>
                    <td style={{ ...td, fontWeight: 700, color: "#be185d" }}>
                      평균 머문 시간
                    </td>
                    <td style={{ ...tdNum, fontWeight: 700, color: "#be185d" }}>
                      {fmtMs(stats.avgDwellMs.A)}
                    </td>
                    <td style={{ ...tdNum, fontWeight: 700, color: "#be185d" }}>
                      {fmtMs(stats.avgDwellMs.B)}
                    </td>
                    <td style={{ ...tdNum, color: "#9e9e9e" }}>—</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 해석 가이드 */}
            <div
              style={{
                background: "white",
                borderRadius: 12,
                padding: 16,
                fontSize: 12,
                color: "#666",
                lineHeight: 1.65,
                border: "1px solid #ededed",
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#1f1f1f",
                  marginBottom: 8,
                }}
              >
                지표 해석
              </div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                <li>
                  <b>CTR</b> = 알림 노출 대비 클릭률. A vs B 어느 카피가 효과적인지.
                </li>
                <li>
                  <b>푸시 → 진입</b> = 토스 푸시 deeplink로 미니앱 진입한 수. 사장님 영업 핵심 데이터.
                </li>
                <li>
                  <b>모달 본 수</b> = "방금 다른 고객 결제" 화면까지 도달한 수.
                </li>
                <li>
                  <b>평균 머문 시간</b> = 모달에서 머문 평균 (초). 진정성 있는 관심 척도.
                </li>
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 8px",
  fontSize: 11,
  fontWeight: 600,
  color: "#9e9e9e",
  textTransform: "uppercase",
  letterSpacing: 0.5,
};
const td: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 8px",
  color: "#1f1f1f",
};
const tdNum: React.CSSProperties = {
  textAlign: "right",
  padding: "10px 8px",
  color: "#1f1f1f",
  fontVariantNumeric: "tabular-nums",
};

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        background: "white",
        borderRadius: 12,
        padding: 16,
        border: accent ? "1px solid #fbcfe8" : "1px solid #ededed",
        backgroundColor: accent ? "#fdf2f8" : "white",
      }}
    >
      <div style={{ fontSize: 11, color: "#9e9e9e", marginBottom: 6 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 800,
          color: accent ? "#be185d" : "#1f1f1f",
          letterSpacing: -0.5,
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: "#9e9e9e", marginTop: 4 }}>{sub}</div>
      )}
    </div>
  );
}
