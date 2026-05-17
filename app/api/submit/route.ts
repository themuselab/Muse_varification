import { NextRequest, NextResponse } from "next/server";

type SubmitBody = {
  instagram: string;
  industry: string;
  templateId: string;
  shopName: string;
  location: string;
  message: string;
  customRequest?: string;
  isCustom?: boolean;
};

const INDUSTRY_LABELS: Record<string, string> = {
  hair: "헤어샵",
  brow: "눈썹/반영구",
  nail: "네일",
  lash: "속눈썹",
  skin: "피부/마사지",
};

const TEMPLATE_LABELS: Record<string, string> = {
  "01_full_photo": "풀 사진 + 헤드라인 오버레이",
  "02_after_hero": "시술 결과 후크",
  "03_offer": "할인 광고 (반-반 레이아웃)",
  "04_macro": "결과 매크로 클로즈업",
  "05_founder": "원장님 스토리 (분할)",
  "06_scarcity_dark": "프리미엄 다크 + 희소성",
  "07_question_hook": "공감 후크 (질문)",
  "08_new_open": "신규 매장 오픈",
};

function generateCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** Gemini로 사장님 메시지 분석 → 맞춤 GPT 프롬프트 생성 */
async function generateCustomPromptWithGemini(
  body: SubmitBody,
  templateImageUrl: string | null,
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const indLabel = INDUSTRY_LABELS[body.industry] || body.industry;
  const tplLabel = body.isCustom
    ? "(맞춤 제작)"
    : TEMPLATE_LABELS[body.templateId] || body.templateId;

  const systemContext = `너는 1인 뷰티샵 인스타 광고 디자이너의 어시스턴트야.
사장님이 신청한 정보를 받고, 디자이너가 ChatGPT(gpt-image-2)에게 바로 붙여넣어서
광고 이미지를 만들 수 있는 **맞춤 프롬프트**를 생성해야 해.

핵심 원칙:
- 사장님 메시지에서 진짜 강조하고 싶은 키워드 추출 (예: "프라이빗", "10년차", "청담", "커트 전문")
- 그 키워드를 광고 카피와 이미지 컨셉에 반드시 반영
- 갈색/베이지 뷰티 표준 팔레트
- 광고 포스터 형식 (카드뉴스 X)
- 한국 1인샵 사장님 1인칭 톤 (시적 표현 X, 직설 O)

출력 형식 (마크다운):
## 핵심 컨셉
한 줄 요약

## 이미지 수정 지시
첨부된 템플릿 이미지를 어떻게 바꿀지 구체적 지시
- 모델/사진 변경 사항
- 색감 조정 (있으면)
- 텍스트 위치/크기

## 헤드라인 (한국어, 1줄)
임팩트 있는 한 줄

## 서브 카피 (한국어, 1줄)
구체적 베네핏

## CTA 영역
- 가게 이름 + 위치
- 인스타 핸들`;

  const userInput = `[사장님 신청 정보]
- 업종: ${indLabel}
- 가게 이름: ${body.shopName}
- 위치: ${body.location || "(없음)"}
- 인스타: @${body.instagram}
- 선택 템플릿: ${body.templateId} — ${tplLabel}
- 템플릿 미리보기 URL: ${templateImageUrl || "(없음)"}

[사장님이 강조하고 싶은 메시지 — 이걸 캐치해서 반영해줘]
"${body.message || body.customRequest || "(특별한 요청 없음)"}"

${body.isCustom ? "**맞춤 제작 모드**: 템플릿 무시하고 사장님 요청대로 디자인" : ""}

위 정보로 디자이너가 ChatGPT에 그대로 복붙할 맞춤 프롬프트를 만들어줘.`;

  try {
    console.log("[Gemini] calling with input:", userInput.slice(0, 200));
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemContext }] },
          contents: [{ role: "user", parts: [{ text: userInput }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1500,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      },
    );
    console.log("[Gemini] status:", res.status);
    if (!res.ok) {
      console.error("[Gemini] error body:", await res.text());
      return null;
    }
    const data = await res.json();
    const text: string | undefined =
      data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error("[Gemini] no text in response:", JSON.stringify(data).slice(0, 500));
    } else {
      console.log("[Gemini] got prompt:", text.slice(0, 200));
    }
    return text?.trim() || null;
  } catch (e) {
    console.error("[Gemini] fetch threw:", e);
    return null;
  }
}

/** Gemini 실패 시 fallback (정적 프롬프트) */
function fallbackPrompt(body: SubmitBody): string {
  const indLabel = INDUSTRY_LABELS[body.industry] || body.industry;
  const tplLabel = body.isCustom
    ? "(맞춤 제작)"
    : TEMPLATE_LABELS[body.templateId] || body.templateId;
  return `## 핵심 컨셉
${body.shopName} · ${indLabel} 광고 (${tplLabel})

## 사장님 메시지
${body.message || body.customRequest || "(없음)"}

## 기본 가이드
- 갈색/베이지 뷰티 톤
- 광고 포스터 형식
- 1080x1080 인스타 피드용

## CTA
${body.shopName}${body.location ? ` · ${body.location}` : ""} · @${body.instagram}`;
}

export async function POST(req: NextRequest) {
  let body: SubmitBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.instagram?.trim() || !body.industry || !body.shopName?.trim()) {
    return NextResponse.json({ error: "필수 항목 누락" }, { status: 400 });
  }
  if (body.isCustom) {
    if (!body.customRequest?.trim()) {
      return NextResponse.json(
        { error: "맞춤 요청 내용 누락" },
        { status: 400 },
      );
    }
  } else if (!body.templateId) {
    return NextResponse.json({ error: "템플릿 누락" }, { status: 400 });
  }

  const code = generateCode();
  const submittedAt = new Date().toISOString();
  const indLabel = INDUSTRY_LABELS[body.industry] || body.industry;
  const tplLabel = body.isCustom
    ? "맞춤"
    : TEMPLATE_LABELS[body.templateId] || body.templateId;

  // 외부 접근 가능한 이미지 URL
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    "https://themuselab.kr";
  const templateImageUrl = body.isCustom
    ? null
    : `${siteUrl}/templates/${body.industry}/${body.templateId}.png`;

  // Gemini로 맞춤 프롬프트 생성
  const geminiPrompt = await generateCustomPromptWithGemini(
    body,
    templateImageUrl,
  );
  const customPrompt = geminiPrompt || fallbackPrompt(body);

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log("📋 No webhook:", { code, ...body, prompt: customPrompt });
    return NextResponse.json({ code });
  }

  try {
    // 신청 정보 임베드 (이미지 포함)
    const infoEmbed: Record<string, unknown> = {
      title: `${body.shopName} · ${indLabel}`,
      url: `https://instagram.com/${body.instagram}`,
      color: body.isCustom ? 0xdb3e7f : 0xf3498d,
      fields: [
        { name: "코드", value: `\`${code}\``, inline: true },
        { name: "업종", value: indLabel, inline: true },
        { name: "타입", value: body.isCustom ? "맞춤" : "템플릿", inline: true },
        {
          name: "📱 DM 보낼 곳",
          value: `[@${body.instagram}](https://instagram.com/${body.instagram})`,
          inline: false,
        },
        {
          name: "🏪 가게",
          value: `${body.shopName}${body.location ? ` · ${body.location}` : ""}`,
          inline: false,
        },
        {
          name: body.isCustom ? "🎨 맞춤 요청" : "📐 템플릿",
          value: body.isCustom
            ? (body.customRequest || "_(없음)_").slice(0, 1020)
            : `${body.templateId} — ${tplLabel}`,
          inline: false,
        },
        {
          name: "💬 사장님 메시지",
          value: (body.message || "_(없음)_").slice(0, 1020),
          inline: false,
        },
      ],
      footer: {
        text: `🤖 ${geminiPrompt ? "Gemini 분석 완료" : "기본 프롬프트"} · ${submittedAt}`,
      },
    };
    if (templateImageUrl) {
      infoEmbed.image = { url: templateImageUrl };
    }

    // GPT 프롬프트 임베드 (디자이너용)
    const promptEmbed: Record<string, unknown> = {
      title: `📋 ChatGPT 프롬프트 (복붙용)`,
      description: customPrompt.slice(0, 4000),
      color: 0x767676,
    };
    if (templateImageUrl) {
      promptEmbed.thumbnail = { url: templateImageUrl };
      promptEmbed.fields = [
        {
          name: "📎 첨부할 템플릿 이미지",
          value: `[다운로드 / 이 이미지를 ChatGPT에 같이 첨부](${templateImageUrl})`,
        },
      ];
    }

    const payload = {
      content: body.isCustom
        ? `🎨 **맞춤 광고 신청** \`${code}\` (24시간 소요)`
        : `🎨 **새 광고 신청** \`${code}\` (30분 내)`,
      embeds: [infoEmbed, promptEmbed],
    };
    const dRes = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!dRes.ok) {
      const errBody = await dRes.text();
      console.error("Discord webhook FAILED", dRes.status, errBody);
      console.error("Payload was:", JSON.stringify(payload).slice(0, 500));
    } else {
      console.log("Discord webhook sent OK", dRes.status);
    }
  } catch (e) {
    console.error("Discord webhook fetch threw:", e);
  }

  return NextResponse.json({ code });
}
