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
};

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
  evening2: {
    prompt:
      "저녁 두 번째(21시반) - 차별점/특징 자연스럽게 노출. 직접 광고 X, 발견 형식으로.",
    pattern_hint: "E (발견/통찰)",
    topic_tag: "뷰티",
  },
  evening3: {
    prompt:
      "저녁 세 번째(22시) - 다른 사장님 실제 댓글이나 사례 인용해서 신뢰감.",
    pattern_hint: "B (사례+결과) 또는 C (인용)",
    topic_tag: "광고",
  },
  evening4: {
    prompt:
      "저녁 마무리(22시반) - 가볍게 친근하게. 댓글 유도 질문으로 끝.",
    pattern_hint: "사장님들에게 묻는 질문형 — 답변 받기 좋은 구체적 질문",
    topic_tag: "1인샵",
  },
};

function validate(text: string): { ok: boolean; reason?: string } {
  if (text.length < 50) return { ok: false, reason: `too short (${text.length}자)` };
  if (text.length > 500) return { ok: false, reason: `too long (${text.length}자)` };
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

  // Gemini 생성
  let text: string;
  try {
    const userPrompt = `[슬롯: ${slot}]
${config.prompt}

[패턴 힌트]
${config.pattern_hint}

[작업]
위 가이드와 톤 예시를 참고해서 글 본문 1개만 작성해. 따옴표나 설명 없이 본문 텍스트만. 한국어 100~250자.`;

    const raw = await generate(STYLE_GUIDE, userPrompt, { temperature: 1.0 });
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
  const v = validate(text);
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
    return NextResponse.json({ ok: true, dry_run: true, slot, text, topic_tag: config.topic_tag });
  }

  // Publish
  let result: { id: string; permalink: string };
  try {
    result = await publish(text, { topic_tag: config.topic_tag });
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
