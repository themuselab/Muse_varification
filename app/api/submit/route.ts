import { NextRequest, NextResponse } from "next/server";
import { trackSubmission } from "@/lib/kv";
import { fetchProfile, fetchProfilePicBytes } from "@/lib/instagram";
import type { InstagramProfile } from "@/lib/instagram";
import { generate as geminiGenerate } from "@/lib/gemini";
import type { ImageInput } from "@/lib/gemini";

type SubmitBody = {
  instagram: string;
  industry: string;
  templateId: string;
  shopName: string;
  location: string;
  message: string;
  customRequest?: string;
  isCustom?: boolean;
  feedPhoto?: { mime: string; base64: string } | null;
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

/** Gemini로 사장님 메시지 + IG 프로필 + 업로드 사진 톤 분석 → 맞춤 GPT 프롬프트 생성 */
async function generateCustomPromptWithGemini(
  body: SubmitBody,
  templateImageUrl: string | null,
  profile: InstagramProfile | null,
  profilePic: ImageInput | null,
  uploadedPhoto: ImageInput | null,
): Promise<string | null> {
  const indLabel = INDUSTRY_LABELS[body.industry] || body.industry;
  const tplLabel = body.isCustom
    ? "(맞춤 제작)"
    : TEMPLATE_LABELS[body.templateId] || body.templateId;

  const systemContext = `너는 1인 뷰티샵 인스타 광고 디자이너의 어시스턴트야.
사장님이 신청한 정보 + 사장님 인스타 프로필 + (선택적으로) 사장님이 직접 올린 best 사진을 받고,
디자이너가 ChatGPT(gpt-image-2)에게 바로 붙여넣어서 광고 이미지를 만들 수 있는
**맞춤 프롬프트**를 생성해야 해.

[이미지 우선순위]
1. "사장님 업로드 사진" — 사장님이 직접 고른 best 피드 사진. 톤 분석 1순위. (있을 때만)
2. "프로필 사진" — 인스타 프로필에서 자동 수집. 보조용.

핵심 원칙:
- 사장님 메시지에서 진짜 강조하고 싶은 키워드 추출
- 첨부된 사진(들)을 보고 가게의 시각적 톤 분석 (색감/분위기/스타일)
- 업로드 사진이 있으면 그게 메인 톤. 없으면 프로필 사진으로 추정.
- 분석한 톤을 광고 이미지 컨셉에 반드시 반영
- 광고 포스터 형식 (카드뉴스 X)
- 한국 1인샵 사장님 1인칭 톤 (시적 표현 X, 직설 O)

출력 형식 (마크다운):
## 핵심 컨셉
한 줄 요약

## 사장님 가게 톤 분석
첨부 사진(들)에서 본 시각적 특징 — 컬러 팔레트, 분위기, 디자인 스타일.
어떤 사진을 메인 톤 소스로 썼는지 명시 (업로드 / 프로필).
이걸 광고에 그대로 반영해야 함.

## 이미지 수정 지시
첨부된 템플릿 이미지를 어떻게 바꿀지 구체적 지시
- 모델/사진 변경 사항
- 색감 조정 (위 톤 분석 반영)
- 텍스트 위치/크기

## 헤드라인 (한국어, 1줄)
임팩트 있는 한 줄

## 서브 카피 (한국어, 1줄)
구체적 베네핏

## CTA 영역
- 가게 이름 + 위치
- 인스타 핸들`;

  const profileBlock = profile
    ? `[사장님 인스타 프로필 (자동 fetch)]
- 표시명: ${profile.name}
- 팔로워: ${profile.followers ?? "?"} · 팔로잉: ${profile.following ?? "?"} · 게시물: ${profile.posts ?? "?"}
- 핸들: @${profile.handle}
- bio/title 원문: ${profile.displayTitle.slice(0, 200)}`
    : `[인스타 프로필 fetch 실패]`;

  const imageBlock = uploadedPhoto
    ? `[첨부 이미지 1번 = 사장님 업로드 best 사진 — 톤 분석 1순위]${profilePic ? "\n[첨부 이미지 2번 = 자동 수집 프로필 사진 — 보조 톤]" : ""}`
    : profilePic
      ? `[첨부 이미지 = 자동 수집 프로필 사진 — 톤 분석]`
      : `[첨부 이미지 없음 — 메시지만 활용해서 톤 추정]`;

  const userInput = `[사장님 신청 정보]
- 업종: ${indLabel}
- 가게 이름: ${body.shopName}
- 위치: ${body.location || "(없음)"}
- 인스타: @${body.instagram}
- 선택 템플릿: ${body.templateId} — ${tplLabel}
- 템플릿 미리보기 URL: ${templateImageUrl || "(없음)"}

${profileBlock}

${imageBlock}

[사장님이 강조하고 싶은 메시지 — 이걸 캐치해서 반영해줘]
"${body.message || body.customRequest || "(특별한 요청 없음)"}"

${body.isCustom ? "**맞춤 제작 모드**: 템플릿 무시하고 사장님 요청대로 디자인" : ""}

위 정보로 디자이너가 ChatGPT에 그대로 복붙할 맞춤 프롬프트를 만들어줘.
사장님 가게 톤이 반영된 광고가 나오도록 구체적으로.`;

  try {
    // 이미지 순서: 업로드 사진(있으면) 먼저, 그 다음 프로필 사진
    const images: ImageInput[] = [];
    if (uploadedPhoto) images.push(uploadedPhoto);
    if (profilePic) images.push(profilePic);

    console.log(
      "[Gemini] handle:", profile?.handle,
      "uploaded:", !!uploadedPhoto,
      "profilePic:", !!profilePic,
    );
    const text = await geminiGenerate(systemContext, userInput, {
      temperature: 0.7,
      maxTokens: 1500,
      images: images.length ? images : undefined,
    });
    console.log("[Gemini] got prompt:", text.slice(0, 200));
    return text || null;
  } catch (e) {
    console.error("[Gemini] failed:", e);
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

  // 1) 사장님 인스타 프로필 fetch (실패해도 진행)
  const profile = await fetchProfile(body.instagram).catch(() => null);
  const profilePic =
    profile?.profilePicUrl
      ? await fetchProfilePicBytes(profile.profilePicUrl).catch(() => null)
      : null;

  // 2) 사장님이 업로드한 best 사진 (선택)
  const uploadedPhoto: ImageInput | null =
    body.feedPhoto &&
    typeof body.feedPhoto.mime === "string" &&
    typeof body.feedPhoto.base64 === "string"
      ? { mime: body.feedPhoto.mime, base64: body.feedPhoto.base64 }
      : null;

  // 3) Gemini로 맞춤 프롬프트 생성 (업로드 사진 + 프로필 사진 둘 다 vision input)
  const geminiPrompt = await generateCustomPromptWithGemini(
    body,
    templateImageUrl,
    profile,
    profilePic,
    uploadedPhoto,
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

    // 사장님 업로드 사진이 있으면 임베드에 reference + multipart 첨부
    if (uploadedPhoto) {
      promptEmbed.fields = [
        ...(Array.isArray(promptEmbed.fields) ? promptEmbed.fields : []),
        {
          name: "📸 사장님 업로드 사진",
          value: "아래 첨부된 `feed-photo.*` 파일 — 톤 분석에 사용됨",
        },
      ];
    }

    const payload = {
      content: body.isCustom
        ? `🎨 **맞춤 광고 신청** \`${code}\``
        : `🎨 **새 광고 신청** \`${code}\``,
      embeds: [infoEmbed, promptEmbed],
    };

    let dRes: Response;
    if (uploadedPhoto) {
      // multipart로 사진 첨부 + payload_json
      const ext = uploadedPhoto.mime.split("/")[1] || "jpg";
      const photoBytes = Buffer.from(uploadedPhoto.base64, "base64");
      const form = new FormData();
      form.append("payload_json", JSON.stringify(payload));
      form.append(
        "files[0]",
        new Blob([new Uint8Array(photoBytes)], { type: uploadedPhoto.mime }),
        `feed-photo-${code}.${ext}`,
      );
      dRes = await fetch(webhookUrl, { method: "POST", body: form });
    } else {
      dRes = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

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

  // Redis 카운터 (실패해도 신청은 성공해야 하므로 best-effort)
  try {
    await trackSubmission({
      code,
      industry: body.industry,
      isCustom: !!body.isCustom,
      shopName: body.shopName,
    });
  } catch (e) {
    console.error("Redis trackSubmission failed:", e);
  }

  return NextResponse.json({ code });
}
