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
  recruit?: boolean; // true면 베타 모집 CTA 포함
};

// 우리 viral 자산 글 (시장조사 15 댓글, 스레드야나를 12 댓글, 154명리스트 6 댓글)
// 새 정체성과 다른 주제지만 인용해도 어색하지 않은 글만 유지.
const VIRAL_OWN_POSTS = [
  "18163019152436550", // 시장조사 — 15 댓글
  "17947555991997279", // 스레드야 나를 — 12 댓글
];

// 2026-05-28 피벗: 광고 이미지 → 빈 시간 매출 회수 (Slot Recovery)
// 슬롯 7개 → 3개로 축소. 페인 발굴 / 통찰 / 베타 모집 사이클.
const SLOTS: Record<string, SlotConfig> = {
  morning_pain: {
    prompt:
      "아침 9시 - 사장님 영업 시작 직전 폰 시간. 펑크/취소/네이버플레이스 경험에 대한 직접 질문으로 페인 발굴. 댓글이 가장 잘 달리는 시간대니까 답변 쉬운 구체적 질문으로.",
    pattern_hint:
      "F (직접 질문) 또는 C (인용+공감) — 답하기 쉬운 질문, 사장님들이 본인 경험 댓글로 답하게.",
    topic_tag: "1인샵",
  },
  lunch_insight: {
    prompt:
      "점심 12시반 - 짧은 쉬는 시간. 빈 시간 회수/펑크 채움에 관한 통찰 한 줄. 저장(북마크)될 만한 작은 사례나 숫자.",
    pattern_hint:
      "E (발견/통찰) 또는 A (통계+호기심) — 짧고 임팩트, 한 입에 들어와서 북마크되는 톤.",
    topic_tag: "1인샵",
  },
  evening_recruit: {
    prompt:
      "저녁 9시반 - 영업 마감 후 폰 시간. 베타테스터 모집 — 1-3분, 2주 무료, 사장님 단골 풀에 컨시어지로 카톡 알림 도와드림. 첫 2-3줄 강한 hook(펑크 페인 공감) 후 디테일 길게, 마지막에 DM 부드러운 CTA. recruit 슬롯이니 가이드의 [베타 모집 톤 가이드] 따르기.",
    pattern_hint:
      "B (사례+결과) → recruit CTA. 첫 줄 페인 공감, 본문에 컨시어지 디테일, 마지막에 'DM 부담 없이 주세요'.",
    topic_tag: "1인샵",
    long: true,
    recruit: true,
  },
};

function validate(
  text: string,
  config: SlotConfig,
): { ok: boolean; reason?: string } {
  const minLen = config.long ? 200 : 50;
  // recruit 슬롯은 디테일 필요해서 600자까지 허용. 일반/long은 500.
  const maxLen = config.recruit ? 600 : 500;
  if (text.length < minLen) return { ok: false, reason: `too short (${text.length}자, min ${minLen})` };
  if (text.length > maxLen) return { ok: false, reason: `too long (${text.length}자, max ${maxLen})` };
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

// Threads 본문 500자 한계 대비 — Gemini가 길게 뽑으면 문장 경계에서 잘라서 발행.
// 발행 실패보다 잘려도 발행되는 게 나음 (validate에서 too long fail 방지).
function stripExcess(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  // 마지막 문장 경계 (. ? ! 줄바꿈)
  const candidates = [
    cut.lastIndexOf("."),
    cut.lastIndexOf("?"),
    cut.lastIndexOf("!"),
    cut.lastIndexOf("\n"),
  ];
  const lastBoundary = Math.max(...candidates);
  // 60% 지점 이후 경계가 있으면 거기서 자름 (앞부분만 남는 사고 방지)
  if (lastBoundary > maxLen * 0.6) {
    return cut.slice(0, lastBoundary + 1).trim();
  }
  // 경계 못 찾으면 그냥 자르고 마무리 표시
  return cut.trim() + "…";
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
      ? "280~420자 (절대 480자 넘지 말 것 — 넘으면 잘려서 발행됨). 첫 2-3줄에 가장 강한 hook 박고, 그 뒤로 스토리/디테일 적절히."
      : "100~220자.";
    const counterInstruction = config.counter
      ? "\n[반어/카운터 톤]\n첫 줄을 의도적으로 반대로 말해서 호기심 폭발. '사장님, 사실 ___' 또는 '___ 안 하셔도 돼요' 같은 hook. 답은 본문 마지막에 살짝 또는 댓글로 미뤄서 클릭/체류 유도."
      : "";
    const quoteInstruction = config.quote_viral
      ? "\n[인용 모드]\n우리가 이전에 올린 글 중 댓글이 많이 달린 viral 자산을 인용함. '지난번에 ___ 답해주셨는데' 또는 '그때 그 댓글이...' 같이 회고/연결하는 톤. quote_post가 자동으로 첨부되니 본문에서 quote 자체를 다시 인용하지 말고 자연스럽게 후속 흐름으로."
      : "";
    const recruitInstruction = config.recruit
      ? "\n[베타 모집 모드]\n구조: ① 첫 2-3줄 = 펑크/취소 페인 공감 hook ② 중간 = 컨시어지 디테일 (사장님 1-3분, 2주 무료, 사장님은 카톡 한 줄만, 우리가 단골 알림 정리/대행, 사장님 본인 카톡으로 보내니 단골 신뢰도 그대로) ③ 마지막 1-2줄 = 부담 제거 키워드 + DM CTA ('결과 별로면 그냥 끝, DM 부담 없이 주세요 🙏'). 영업톤 X, 진정성+컨시어지 톤. 본문 URL 절대 X."
      : "";

    const userPrompt = `[슬롯: ${slot}]
${config.prompt}

[패턴 힌트]
${config.pattern_hint}
${counterInstruction}${quoteInstruction}${recruitInstruction}

[길이]
${lenInstruction}

[작업]
위 가이드와 톤 예시를 참고해서 글 본문 1개만 작성해. 따옴표나 설명 없이 본문 텍스트만. 한국어.`;

    const raw = await generate(STYLE_GUIDE, userPrompt, { temperature: 1.0, maxTokens: config.long ? 1500 : 800 });
    // 1) 따옴표/backtick 제거, 2) 480자 초과 시 문장 경계에서 잘라 발행 실패 방지
    text = stripExcess(stripQuotes(raw), 480);
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
