import { NextRequest, NextResponse } from "next/server";
import { getTrackStats, kstDate } from "@/lib/kv";
import { notify, COLORS } from "@/lib/discord";

// 매일 KST 00:00에 어제 데이터 보고 → Discord
// GitHub Actions cron이 호출. Authorization: Bearer {CRON_SECRET}
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 기본 = 어제 (KST). ?date=YYYY-MM-DD 로 특정 일자 보고도 가능.
  const explicitDate = req.nextUrl.searchParams.get("date");
  const reportDate =
    explicitDate || kstDate(new Date(Date.now() - 86400_000));

  let stats;
  try {
    stats = await getTrackStats(reportDate);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await notify({
      username: "Muse Track",
      embeds: [
        {
          title: `❌ 보고 실패 — ${reportDate}`,
          description: msg.slice(0, 500),
          color: COLORS.red,
        },
      ],
    });
    return NextResponse.json({ error: "stats_failed", detail: msg }, { status: 500 });
  }

  const totalImp = stats.byEvent.impression || 0;
  const totalClk = stats.byEvent.alert_click || 0;
  const totalSess = stats.byEvent.session_start || 0;
  const ctrPct = (stats.ctr.overall * 100).toFixed(1);
  const ctrA = (stats.ctr.A * 100).toFixed(1);
  const ctrB = (stats.ctr.B * 100).toFixed(1);
  const fmtMs = (ms: number) => (ms ? `${(ms / 1000).toFixed(1)}초` : "—");
  const A = stats.byVariant.A;
  const B = stats.byVariant.B;

  // 비활성 일자는 가벼운 요약만
  const isQuiet = totalSess === 0 && totalImp === 0;

  if (isQuiet) {
    await notify({
      username: "Muse Track",
      embeds: [
        {
          title: `📊 검증 데이터 — ${reportDate}`,
          description: "어제 데이터가 없어요 (세션 0, 노출 0).",
          color: COLORS.gray,
          footer: { text: "themuselab.kr/api/track" },
        },
      ],
    });
    return NextResponse.json({ ok: true, date: reportDate, quiet: true });
  }

  await notify({
    username: "Muse Track",
    embeds: [
      {
        title: `📊 검증 데이터 — ${reportDate}`,
        color: COLORS.pink,
        fields: [
          {
            name: "🎯 핵심 KPI",
            value:
              `**전체 CTR**: ${ctrPct}% (${totalClk}/${totalImp})\n` +
              `**A안 CTR** (할인): ${ctrA}% · 머문 ${fmtMs(stats.avgDwellMs.A)}\n` +
              `**B안 CTR** (한정): ${ctrB}% · 머문 ${fmtMs(stats.avgDwellMs.B)}\n` +
              `**푸시 → 진입**: ${stats.byEvent.deeplink_open || 0}건`,
            inline: false,
          },
          {
            name: "📋 Funnel",
            value:
              `세션 시작: **${totalSess}**\n` +
              `알림 노출: **${totalImp}**\n` +
              `알림 클릭: **${totalClk}**\n` +
              `핀 클릭: **${stats.byEvent.pin_click || 0}**\n` +
              `모달 본 수: **${stats.byEvent.missed_view || 0}**`,
            inline: true,
          },
          {
            name: "⚖️ A vs B",
            value:
              `세션: ${A.session_start} / ${B.session_start}\n` +
              `노출: ${A.impression} / ${B.impression}\n` +
              `클릭: ${A.alert_click} / ${B.alert_click}\n` +
              `핀: ${A.pin_click} / ${B.pin_click}\n` +
              `모달: ${A.missed_view} / ${B.missed_view}`,
            inline: true,
          },
        ],
        footer: { text: "themuselab.kr/api/track · KST 00:00 자동 발송" },
        timestamp: new Date().toISOString(),
      },
    ],
  });

  return NextResponse.json({
    ok: true,
    date: reportDate,
    sessions: totalSess,
    impressions: totalImp,
    clicks: totalClk,
    ctrPct,
  });
}
