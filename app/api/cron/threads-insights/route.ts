import { NextRequest, NextResponse } from "next/server";
import { listMyPosts, getInsights } from "@/lib/threads";
import { notify, COLORS } from "@/lib/discord";
import {
  getSubmissionStats,
  getReplyCount,
  getPublishCount,
  kstDate,
} from "@/lib/kv";

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "12");

  let posts: Array<{ id: string; text?: string; permalink: string; timestamp: string }> = [];
  try {
    posts = await listMyPosts(limit);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await notify({
      username: "Threads Bot",
      embeds: [{ title: "❌ Insights 에러", description: msg.slice(0, 600), color: COLORS.red }],
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // 글별 insights 수집
  const rows: Array<{
    id: string;
    text: string;
    permalink: string;
    timestamp: string;
    insights: Record<string, number>;
  }> = [];

  for (const p of posts) {
    const insights = await getInsights(p.id);
    rows.push({
      id: p.id,
      text: (p.text || "").slice(0, 60).replace(/\n/g, " "),
      permalink: p.permalink,
      timestamp: p.timestamp,
      insights,
    });
  }

  // 합계
  const totals = rows.reduce(
    (acc, r) => {
      for (const [k, v] of Object.entries(r.insights)) {
        acc[k] = (acc[k] || 0) + v;
      }
      return acc;
    },
    {} as Record<string, number>,
  );

  // Discord 표 만들기 (간단한 형식, embed fields 활용)
  const top = [...rows]
    .sort((a, b) => (b.insights.views || 0) - (a.insights.views || 0))
    .slice(0, 6);

  const dateTag = kstDate();

  // Funnel 데이터 (KV에서)
  let submitStats = {
    total: 0,
    today: 0,
    yesterday: 0,
    thisWeek: 0,
    todayList: [] as Array<{ ts: number; code: string; industry: string; type: string; shop: string }>,
  };
  let replyCount = 0;
  let publishCount = 0;
  try {
    submitStats = await getSubmissionStats();
    replyCount = await getReplyCount();
    publishCount = await getPublishCount();
  } catch (e) {
    console.error("KV stats failed:", e);
  }

  // 신청 리스트 fields
  const submissionFields =
    submitStats.todayList.length > 0
      ? submitStats.todayList.slice(0, 10).map((s) => {
          const t = new Date(s.ts);
          const utc = t.getTime() + t.getTimezoneOffset() * 60_000;
          const kst = new Date(utc + 9 * 3600_000);
          const hm = kst.toISOString().slice(11, 16);
          return {
            name: `🎯 ${s.code} (${hm} KST)`,
            value: `${s.industry} · ${s.type === "custom" ? "맞춤" : "템플릿"} · ${s.shop}`,
            inline: false,
          };
        })
      : [{ name: "오늘 신청 없음", value: "🥲", inline: false }];

  await notify({
    username: "Threads Bot",
    embeds: [
      // 1) Funnel summary
      {
        title: `📊 일일 funnel (${dateTag})`,
        description:
          `**🎯 신청** — 오늘 ${submitStats.today} · 어제 ${submitStats.yesterday} · 7일 ${submitStats.thisWeek} · 누적 ${submitStats.total}\n\n` +
          `**🌸 자동 발행** — 오늘 ${publishCount}글\n` +
          `**↩️ 자동 답글** — 오늘 ${replyCount}개\n\n` +
          `[Vercel Analytics 페이지뷰 직접 확인](https://vercel.com/themuselabcontact-8136s-projects/muse/analytics)`,
        color: COLORS.pink,
      },
      // 2) Threads aggregated
      {
        title: `🪞 Threads 메트릭 (top ${rows.length} 글)`,
        description:
          `views: **${totals.views || 0}**\n` +
          `likes: ${totals.likes || 0}\n` +
          `replies: ${totals.replies || 0}\n` +
          `reposts: ${totals.reposts || 0}\n` +
          `quotes: ${totals.quotes || 0}\n` +
          `shares: ${totals.shares || 0}`,
        color: COLORS.gray,
      },
      // 3) 오늘 신청 리스트
      {
        title: "📝 오늘 신청 명세",
        fields: submissionFields,
        color: 0x16a34a,
      },
      // 4) Top 글
      ...(top.length > 0
        ? [
            {
              title: "🔥 Threads TOP 글 by views",
              fields: top.map((r) => ({
                name: `[${r.insights.views || 0} views] ${r.timestamp.slice(0, 10)}`,
                value: `${r.text}\nlikes: ${r.insights.likes || 0} · replies: ${r.insights.replies || 0} · [link](${r.permalink})`,
                inline: false,
              })),
              color: COLORS.gray,
            },
          ]
        : []),
    ],
  });

  return NextResponse.json({
    ok: true,
    date: dateTag,
    funnel: {
      submit: submitStats,
      auto_reply: replyCount,
      auto_publish: publishCount,
    },
    threads: {
      count: rows.length,
      totals,
    },
  });
}
