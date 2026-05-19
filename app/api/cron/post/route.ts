import { NextRequest, NextResponse } from "next/server";
import { publish } from "@/lib/threads";
import { generate } from "@/lib/gemini";
import { notify, COLORS } from "@/lib/discord";
import { STYLE_GUIDE } from "@/lib/style-guide";
import { trackPublish } from "@/lib/kv";

type SlotConfig = {
  prompt: string;
  pattern_hint: string;
  topic_tag: string;
  long?: boolean; // true면 280자+ 유도 ("더보기" 트릭)
  quote_viral?: boolean; // true면 우리 자산 글 인용
  counter?: boolean; // true면 반어/카운터 톤
};

// 우리 viral 자산 글 (시장조사 15 댓글, 스레드야나를 12 댓글, 154명리스트 6 댓글)
const VIRAL_OWN_POSTS = [
  "18163019152436550", // 시장조사 — 15 댓글
  "17947555991997279", // 스레드야 나를 — 12 댓글
  "17868097254535023", // 154명 리스트 — 6 댓글
];

const SLOTS: Record<string, SlotConfig> = {
  morning: {
    prompt:
      "아침 시간(07시경) - 사장님들 하루 시작. 무거운 주제 X, 긍정적/가벼운 톤. 짧은 통찰이나 따뜻한 관찰.",
    pattern_hint: "B (사례+결과) 또는 E (발견/통찰)",
    topic_tag: "1인샵",
  },
  lunch: {
    prompt:
      "점심 시간(12시반경) - 사장님들 잠깐 쉬는 시간. 짧고 임팩트 있게. 한 입에 들어오는 내용.",
    pattern_hint: "A (통계+호기심) 또는 D (반어)",
    topic_tag: "광고",
  },
  evening1: {
    prompt:
      "저녁 피크 시작(21시) - 영업 마감 후 폰 보는 사장님들. 페인 강조해서 공감.",
    pattern_hint: "C (인용+공감)",
    topic_tag: "1인샵",
  },
  evening2_long: {
    prompt:
      "저녁 두 번째(21시반) - 디테일 스토리. 첫 2-3줄 강한 hook, 그 뒤로 길게 280자+. '더보기' 클릭 유도.",
    pattern_hint:
      "B (사례+결과) — 실제 1인샵 사장님 스토리를 디테일하게. 첫 줄에 임팩트, 그 뒤 디테일.",
    topic_tag: "1인샵",
    long: true,
  },
  evening3_counter: {
    prompt:
      "저녁 세 번째(22시) - 반어/카운터로 호기심 폭발. '사장님, 사실 ___' '___ 하지 마세요' 같은 부드러운 도발.",
    pattern_hint: "D (반어/카운터) — 답을 본문 안에 두지 말고 댓글이나 다음 줄로 미뤄서 호기심 유발",
    topic_tag: "광고",
    counter: true,
    long: true, // counter도 길게
  },
  evening4: {
    prompt:
      "저녁 마무리(22시반) - 가볍게 친근하게. 댓글 유도 질문으로 끝.",
    pattern_hint: "사장님들에게 묻는 질문형 — 답변 받기 좋은 구체적 질문",
    topic_tag: "1인샵",
  },
  midday_quote: {
    prompt:
      "낮 11시쯤 - 우리 viral 자산 글에 새 컨텍스트 붙여서 인용. '그때 답해주신 분들 덕분에 ___' 같은 후속 톤.",
    pattern_hint: "원본 글 흐름을 받아치는 회고형 — '지난번에...' 또는 '그때 답변 보고...'",
    topic_tag: "1인샵",
    quote_viral: true,
  },
};

function validate(
  text: string,
  config: SlotConfig,
): { ok: boolean; reason?: string } {
  const minLen = config.long ? 200 : 50;
  const maxLen = 500;
  if (text.length < minLen) return { ok: false, reason: `too short (${text.length}자, min ${minLen})` };
  if (text.length > maxLen) return { ok: false, reason: `too long (${text.length}자)` };
  if (/themuselab|\.kr|\.com|\.net|https?:\/\//i.test(text)) {
    return { ok: false, reason: "본문에 URL/도메인 포함" };
  }
  if (/^안녕하세요/.test(text)) return { ok: false, reason: "안녕하세요 시작 금지" };
  if (text.includes("#")) return { ok: false, reason: "해시태그 금지" };
  return { ok: true };
}

function stripQuotes(text: string): string {
  // Gemini가 가끔 따옴표나 backtick으로 감싸는 거 제거
  let t = text.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1).trim();
  }
  if (t.startsWith("```") && t.endsWith("```")) {
    t = t.slice(3, -3).trim();
  }
  return t;
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const slot = req.nextUrl.searchParams.get("slot") || "";
  const config = SLOTS[slot];
  if (!config) {
    return NextResponse.json(
      { error: "Invalid slot", available: Object.keys(SLOTS) },
      { status: 400 },
    );
  }

  // Dry-run 옵션 (발행 X, Gemini만 호출해서 결과 확인)
  const dryRun = req.nextUrl.searchParams.get("dry") === "1";

  // 인용 슬롯이면 viral 자산 중 하나 랜덤 선택
  let quotePostId: string | undefined;
  if (config.quote_viral) {
    quotePostId = VIRAL_OWN_POSTS[Math.floor(Math.random() * VIRAL_OWN_POSTS.length)];
  }

  // Gemini 생성
  let text: string;
  try {
    const lenInstruction = config.long
      ? "280~450자 (의도적으로 길게 — '더보기' 자동 트렁케이트 유도). 첫 2-3줄에 가장 강한 hook 박고, 그 뒤로 스토리/디테일 길게."
      : "100~250자.";
    const counterInstruction = config.counter
      ? "\n[반어/카운터 톤]\n첫 줄을 의도적으로 반대로 말해서 호기심 폭발. '사장님, 사실 ___' 또는 '___ 안 하셔도 돼요' 같은 hook. 답은 본문 마지막에 살짝 또는 댓글로 미뤄서 클릭/체류 유도."
      : "";
    const quoteInstruction = config.quote_viral
      ? "\n[인용 모드]\n우리가 이전에 올린 글 중 댓글이 많이 달린 viral 자산을 인용함. '지난번에 ___ 답해주셨는데' 또는 '그때 그 댓글이...' 같이 회고/연결하는 톤. quote_post가 자동으로 첨부되니 본문에서 quote 자체를 다시 인용하지 말고 자연스럽게 후속 흐름으로."
      : "";

    const userPrompt = `[슬롯: ${slot}]
${config.prompt}

[패턴 힌트]
${config.pattern_hint}
${counterInstruction}${quoteInstruction}

[길이]
${lenInstruction}

[작업]
위 가이드와 톤 예시를 참고해서 글 본문 1개만 작성해. 따옴표나 설명 없이 본문 텍스트만. 한국어.`;

    const raw = await generate(STYLE_GUIDE, userPrompt, { temperature: 1.0, maxTokens: config.long ? 1500 : 800 });
    text = stripQuotes(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await notify({
      username: "Threads Bot",
      embeds: [{ title: `❌ Gemini 실패 (${slot})`, description: msg.slice(0, 800), color: COLORS.red }],
    });
    return NextResponse.json({ error: "gemini", detail: msg }, { status: 500 });
  }

  // Validate
  const v = validate(text, config);
  if (!v.ok) {
    await notify({
      username: "Threads Bot",
      embeds: [
        {
          title: `⚠️ 품질 검증 실패 (${slot})`,
          description: `사유: ${v.reason}\n\n생성된 텍스트:\n\`\`\`\n${text.slice(0, 1500)}\n\`\`\``,
          color: COLORS.yellow,
        },
      ],
    });
    return NextResponse.json(
      { error: "validation", reason: v.reason, text },
      { status: 200 },
    );
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dry_run: true,
      slot,
      text,
      length: text.length,
      topic_tag: config.topic_tag,
      quote_post_id: quotePostId,
    });
  }

  // Publish
  let result: { id: string; permalink: string };
  try {
    result = await publish(text, {
      topic_tag: config.topic_tag,
      quote_post_id: quotePostId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await notify({
      username: "Threads Bot",
      embeds: [
        {
          title: `❌ 발행 실패 (${slot})`,
          description: `${msg.slice(0, 600)}\n\n글:\n${text.slice(0, 600)}`,
          color: COLORS.red,
        },
      ],
    });
    return NextResponse.json({ error: "publish", detail: msg, text }, { status: 500 });
  }

  // KV 카운터
  let publishCount = 0;
  try {
    publishCount = await trackPublish({
      slot,
      postId: result.id,
      permalink: result.permalink,
    });
  } catch (e) {
    console.error("trackPublish failed:", e);
  }

  // Notify
  await notify({
    username: "Threads Bot",
    embeds: [
      {
        title: `🌸 자동 발행: ${slot}`,
        description: `${text}\n\n[Threads에서 보기](${result.permalink})`,
        color: COLORS.pink,
        footer: { text: `topic: ${config.topic_tag} · ${result.id} · 오늘 ${publishCount}번째` },
      },
    ],
  });

  return NextResponse.json({
    ok: true,
    slot,
    text,
    topic_tag: config.topic_tag,
    id: result.id,
    permalink: result.permalink,
  });
}
