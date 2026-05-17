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

function generateCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function POST(req: NextRequest) {
  let body: SubmitBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // 기본 검증
  if (!body.instagram?.trim() || !body.industry || !body.shopName?.trim()) {
    return NextResponse.json({ error: "필수 항목 누락" }, { status: 400 });
  }

  if (body.isCustom) {
    if (!body.customRequest?.trim()) {
      return NextResponse.json({ error: "맞춤 요청 내용 누락" }, { status: 400 });
    }
  } else if (!body.templateId) {
    return NextResponse.json({ error: "템플릿 누락" }, { status: 400 });
  }

  const code = generateCode();
  const submittedAt = new Date().toISOString();
  const kind = body.isCustom ? "맞춤제작" : "템플릿";

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      const fields = [
        { name: "코드", value: `\`${code}\``, inline: true },
        { name: "타입", value: kind, inline: true },
        { name: "업종", value: body.industry, inline: true },
        {
          name: "인스타",
          value: `[@${body.instagram}](https://instagram.com/${body.instagram})`,
          inline: true,
        },
        { name: "위치", value: body.location || "-", inline: true },
        {
          name: "메시지",
          value: body.message || "_(없음)_",
          inline: false,
        },
      ];

      if (body.isCustom) {
        fields.splice(3, 0, {
          name: "🎨 맞춤 요청 내용",
          value: body.customRequest || "_(없음)_",
          inline: false,
        });
      } else {
        fields.splice(3, 0, {
          name: "템플릿",
          value: body.templateId,
          inline: true,
        });
      }

      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: body.isCustom
            ? `🎨 **맞춤 광고 신청** \`${code}\` (24시간 소요)`
            : `🎨 **새 광고 신청** \`${code}\` (30분 내)`,
          embeds: [
            {
              title: `${body.shopName} · ${kind}`,
              color: body.isCustom ? 0xDB3E7F : 0xF3498D,
              fields,
              footer: { text: `신청일: ${submittedAt}` },
            },
          ],
        }),
      });
    } catch (e) {
      console.error("Discord webhook failed:", e);
    }
  } else {
    console.log("📋 New submission (no webhook):", { code, ...body });
  }

  return NextResponse.json({ code });
}
