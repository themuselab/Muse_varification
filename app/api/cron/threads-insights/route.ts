import { NextRequest, NextResponse } from "next/server";
import { listMyPosts, getInsights } from "@/lib/threads";
import { notify, COLORS } from "@/lib/discord";

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

  const dateTag = new Date().toISOString().slice(0, 10);

  await notify({
    username: "Threads Bot",
    embeds: [
      {
        title: `📊 일일 메트릭 (${dateTag})`,
        description:
          `총 글: ${rows.length}\n` +
          `views: ${totals.views || 0}\n` +
          `likes: ${totals.likes || 0}\n` +
          `replies: ${totals.replies || 0}\n` +
          `reposts: ${totals.reposts || 0}\n` +
          `quotes: ${totals.quotes || 0}\n` +
          `shares: ${totals.shares || 0}`,
        color: COLORS.pink,
      },
      {
        title: "🔥 TOP 6 by views",
        fields: top.map((r) => ({
          name: `[${r.insights.views || 0} views] ${r.timestamp.slice(0, 10)}`,
          value: `${r.text}\nlikes: ${r.insights.likes || 0} · replies: ${r.insights.replies || 0} · [link](${r.permalink})`,
          inline: false,
        })),
        color: COLORS.gray,
      },
    ],
  });

  return NextResponse.json({
    ok: true,
    count: rows.length,
    totals,
    top: top.map((r) => ({
      id: r.id,
      views: r.insights.views || 0,
      replies: r.insights.replies || 0,
    })),
  });
}
