import { NextRequest, NextResponse } from "next/server";
import { conversation, listMyPosts, publish } from "@/lib/threads";
import { generate } from "@/lib/gemini";
import { notify, COLORS } from "@/lib/discord";
import { trackAutoReply } from "@/lib/kv";

const SELF = "themuselab.official";
const WINDOW_MS = 6 * 60 * 1000;

const REPLY_SYSTEM = `너는 @themuselab.official 1인 뷰티샵 광고 자동 생성 서비스의 친근한 응대자다.

타겟: 1인 뷰티샵 사장님 (헤어/네일/반영구/속눈썹/피부)
제품: 가게 톤에 맞춘 인스타 광고 1장을 DM으로 자동 발송
링크: 프로필 bio에 themuselab.kr 있음 (본문에 URL 절대 X)

답글 톤 규칙:
- 친근하게, "사장님" / "원장님" 호명 (반말 글엔 반말도 OK)
- 1-3줄, 50~150자
- 상대 댓글의 감정/맥락 정확히 받아치기
- "프로필 링크" 또는 DM 유도 자연스럽게
- 광고스러운 표현 X ("지금 신청!" X)
- 가벼운 이모지 1개 (🌸 🙏 🙌 👀 ✨)

[참고 답글 예시 — 우리 톤]

상대: "완전 나잖아...?? 어떻게 신청하는건데!!!!"
답: "오 반가워요!!! 🙌
프로필 링크 들어가시면 30초만에 신청 끝나요.
인스타 ID + 가게 정보만 입력하시면 광고 1장 DM으로 와요. 베타라 무료입니다 🌸"

상대: "캔바 좋은 점 자세히 알려주신 거 정말 큰 도움 됐어요"
답: "캔바 좋은 점 자세히 알려주신 거 정말 큰 도움 됐어요 🙏
'모바일 + 무료 + 템플릿 추천' 강점은 그대로 두고
'내 가게만의 톤' 부분만 자동화하는 방향으로 만들었어요."

상대: "캔바 쓰고 있어!"
답: "오 캔바 그대로 쓰는 거 베스트 🙌
근데 광고 1장씩 가게 톤 맞춰서 DM으로 받는 옵션도 만들었어!
프로필 링크 가보면 있어 🌸"

상대: "스하리 감사해요"
답: "스하리 감사해요~ 반하리 곧 갈게요 🤝
혹시 매장 운영 중이시면 프로필 링크 한 번 보세요!
광고 한 장 무료로 만들어드려요 🌸"

🚫 절대 안 됨:
- 본문에 URL/도메인 (themuselab.kr 절대 X)
- "안녕하세요" 시작
- 해시태그
- 답변이 광고 그 자체
`;

type Comment = {
  id: string;
  text?: string;
  username: string;
  timestamp: string;
  permalink: string;
  replied_to?: { id: string };
};

type Post = { id: string; text?: string; permalink: string; timestamp: string };

function validReply(text: string): { ok: boolean; reason?: string } {
  if (text.length < 30) return { ok: false, reason: `too short` };
  if (text.length > 400) return { ok: false, reason: `too long` };
  if (/themuselab|\.kr|\.com|\.net|https?:\/\//i.test(text)) {
    return { ok: false, reason: "URL/도메인 포함" };
  }
  if (text.includes("#")) return { ok: false, reason: "해시태그 포함" };
  return { ok: true };
}

function stripQuotes(t: string): string {
  let s = t.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

async function generateReply(parent: Post, comment: Comment): Promise<string> {
  const userPrompt = `[원본 글]
"${parent.text || "(없음)"}"

[상대 댓글 — @${comment.username}]
"${comment.text || "(빈 내용)"}"

[작업]
이 댓글에 답글 1개 작성. 본문 텍스트만 (따옴표/설명 X). 50~150자.`;

  const raw = await generate(REPLY_SYSTEM, userPrompt, { temperature: 0.9, maxTokens: 400 });
  return stripQuotes(raw);
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const WEBHOOK = process.env.DISCORD_THREADS_WEBHOOK_URL;
  if (!process.env.THREADS_ACCESS_TOKEN || !WEBHOOK) {
    return NextResponse.json({ error: "missing env" }, { status: 500 });
  }

  // 자동 답글 여부 (query로 끌 수 있음)
  const autoReply = req.nextUrl.searchParams.get("auto_reply") !== "0";

  const now = Date.now();
  const threshold = now - WINDOW_MS;

  let posts: Post[] = [];
  try {
    posts = await listMyPosts(15);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await notify({
      username: "Threads Bot",
      embeds: [{ title: "❌ Monitor 에러 (listMyPosts)", description: msg.slice(0, 600), color: COLORS.red }],
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const newItems: Array<{ post: Post; comment: Comment }> = [];

  for (const post of posts) {
    try {
      const conv = await conversation(post.id);
      for (const c of conv) {
        if (c.username === SELF) continue;
        const ts = new Date(c.timestamp).getTime();
        if (ts >= threshold) newItems.push({ post, comment: c });
      }
    } catch {
      // 글 단위 실패는 넘어감
    }
  }

  // 발견된 새 응답 처리
  const replied: string[] = [];
  const failed: Array<{ id: string; reason: string }> = [];

  for (const { post, comment } of newItems) {
    // 알림 먼저
    await notify({
      username: "Threads Bot",
      embeds: [
        {
          title: `💬 새 응답: @${comment.username}`,
          description:
            (comment.text || "(빈 내용)").slice(0, 800) +
            `\n\n[댓글 보기](${comment.permalink})\n[원본 글](${post.permalink})`,
          color: COLORS.pink,
          footer: { text: `comment_id: ${comment.id} · ${comment.timestamp}` },
        },
      ],
    });

    if (!autoReply) continue;

    // 자동 답글
    try {
      const replyText = await generateReply(post, comment);
      const v = validReply(replyText);
      if (!v.ok) {
        failed.push({ id: comment.id, reason: v.reason || "validation" });
        await notify({
          username: "Threads Bot",
          embeds: [
            {
              title: `⚠️ 자동 답글 품질 검증 실패`,
              description: `상대: @${comment.username}\n사유: ${v.reason}\n\n생성:\n${replyText.slice(0, 600)}`,
              color: COLORS.yellow,
            },
          ],
        });
        continue;
      }

      const result = await publish(replyText, { reply_to_id: comment.id });
      replied.push(comment.id);
      try {
        await trackAutoReply();
      } catch {
        // KV 실패 무시
      }
      await notify({
        username: "Threads Bot",
        embeds: [
          {
            title: `↩️ 자동 답글 발행: @${comment.username}`,
            description: `${replyText}\n\n[답글 보기](${result.permalink})`,
            color: COLORS.green,
            footer: { text: `reply_id: ${result.id}` },
          },
        ],
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failed.push({ id: comment.id, reason: msg });
      await notify({
        username: "Threads Bot",
        embeds: [
          {
            title: `❌ 자동 답글 실패`,
            description: `상대: @${comment.username}\n${msg.slice(0, 600)}`,
            color: COLORS.red,
          },
        ],
      });
    }
  }

  return NextResponse.json({
    ok: true,
    checked_posts: posts.length,
    new_count: newItems.length,
    replied: replied.length,
    failed: failed.length,
    window_minutes: WINDOW_MS / 60000,
    auto_reply: autoReply,
  });
}
