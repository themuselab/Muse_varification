import { NextRequest, NextResponse } from "next/server";

const SELF_USERNAME = "themuselab.official";
// 5분 cron + 1분 버퍼. 가끔 중복 알림 발생 가능하나 누락보단 낫음
const WINDOW_MS = 6 * 60 * 1000;

type Post = {
  id: string;
  text?: string;
  timestamp: string;
  permalink: string;
};

type Comment = {
  id: string;
  text?: string;
  username: string;
  timestamp: string;
  permalink: string;
  replied_to?: { id: string };
};

async function tg(url: string): Promise<unknown> {
  const r = await fetch(url);
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`Threads API ${r.status}: ${body.slice(0, 200)}`);
  }
  return r.json();
}

async function notify(webhook: string, payload: object): Promise<void> {
  await fetch(webhook, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "DiscordBot (muse, 1.0)",
    },
    body: JSON.stringify(payload),
  });
}

export async function GET(req: NextRequest) {
  // Vercel Cron은 Authorization: Bearer ${CRON_SECRET} 헤더로 호출
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const TK = process.env.THREADS_ACCESS_TOKEN;
  const WEBHOOK = process.env.DISCORD_THREADS_WEBHOOK_URL;
  if (!TK || !WEBHOOK) {
    return NextResponse.json(
      { error: "Missing THREADS_ACCESS_TOKEN or DISCORD_THREADS_WEBHOOK_URL" },
      { status: 500 },
    );
  }

  const now = Date.now();
  const threshold = now - WINDOW_MS;

  try {
    // 1. 본인 top-level 글 최근 15개
    const postsRes = (await tg(
      `https://graph.threads.net/v1.0/me/threads?fields=id,text,timestamp,permalink&limit=15&access_token=${TK}`,
    )) as { data: Post[] };
    const posts = postsRes.data || [];

    let newCount = 0;
    const newItems: Array<{ post: Post; comment: Comment }> = [];

    // 2. 각 글의 conversation
    for (const post of posts) {
      const convRes = (await tg(
        `https://graph.threads.net/v1.0/${post.id}/conversation?fields=id,text,username,timestamp,permalink,replied_to&access_token=${TK}`,
      )) as { data: Comment[] };
      for (const c of convRes.data || []) {
        if (c.username === SELF_USERNAME) continue;
        const ts = new Date(c.timestamp).getTime();
        if (ts >= threshold) {
          newItems.push({ post, comment: c });
          newCount++;
        }
      }
    }

    // 3. 본인이 외부 글에 단 답글의 응답도 확인 (replies endpoint)
    const repliesRes = (await tg(
      `https://graph.threads.net/v1.0/me/replies?fields=id,text,timestamp,permalink,root_post,has_replies&limit=15&access_token=${TK}`,
    )) as { data: Array<{ id: string; permalink: string; has_replies: boolean }> };
    for (const r of repliesRes.data || []) {
      if (!r.has_replies) continue;
      try {
        const convRes = (await tg(
          `https://graph.threads.net/v1.0/${r.id}/conversation?fields=id,text,username,timestamp,permalink&access_token=${TK}`,
        )) as { data: Comment[] };
        for (const c of convRes.data || []) {
          if (c.username === SELF_USERNAME) continue;
          const ts = new Date(c.timestamp).getTime();
          if (ts >= threshold) {
            newItems.push({
              post: {
                id: r.id,
                permalink: r.permalink,
                timestamp: "",
              },
              comment: c,
            });
            newCount++;
          }
        }
      } catch {
        // skip if conv fetch fails
      }
    }

    // 4. Discord 알림 전송
    for (const { post, comment } of newItems) {
      await notify(WEBHOOK, {
        username: "Threads Bot",
        embeds: [
          {
            title: `💬 새 응답: @${comment.username}`,
            description:
              (comment.text || "(빈 내용)").slice(0, 800) +
              `\n\n[댓글 보기](${comment.permalink})${post.permalink ? `\n[원본 글](${post.permalink})` : ""}`,
            color: 0xf3498d,
            footer: {
              text: `comment_id: ${comment.id} · ${comment.timestamp}`,
            },
          },
        ],
      });
    }

    return NextResponse.json({
      ok: true,
      checked_posts: posts.length,
      new_count: newCount,
      window_minutes: WINDOW_MS / 60000,
      checked_at: new Date(now).toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // 에러도 디코로 알림
    await notify(WEBHOOK, {
      username: "Threads Bot",
      embeds: [
        {
          title: "❌ Cron 에러",
          description: msg.slice(0, 800),
          color: 0xdc2626,
        },
      ],
    }).catch(() => {});
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
