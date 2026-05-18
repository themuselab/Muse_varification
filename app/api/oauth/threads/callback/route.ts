import { NextRequest } from "next/server";

const REDIRECT_URI = "https://themuselab.kr/api/oauth/threads/callback";

function html(body: string, status = 200) {
  return new Response(
    `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>Threads OAuth</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.6;color:#1a1a1a}
h1{color:#F3498D}pre{background:#f5f5f5;padding:16px;border-radius:8px;word-break:break-all;white-space:pre-wrap;font-size:13px;user-select:all}
.ok{color:#1a7f37}.warn{color:#B45309;font-size:14px;background:#FEF3C7;padding:12px;border-radius:6px}
button{background:#F3498D;color:white;border:none;padding:10px 18px;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600}
code{background:#f0f0f0;padding:2px 6px;border-radius:3px;font-size:13px}</style></head>
<body>${body}</body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const code = sp.get("code");
  const oauthError = sp.get("error");
  const errorDescription = sp.get("error_description");

  if (oauthError) {
    return html(
      `<h1>❌ OAuth Error</h1><pre>${oauthError}\n${errorDescription || ""}</pre>`,
      400,
    );
  }
  if (!code) {
    return html(
      `<h1>코드가 없어요</h1><p>이 URL에 직접 접근하지 마시고, OAuth 인증 링크에서 시작해주세요.</p>`,
      400,
    );
  }

  const appId = process.env.THREADS_APP_ID;
  const appSecret = process.env.THREADS_APP_SECRET;
  if (!appId || !appSecret) {
    return html(
      `<h1>❌ 환경변수 누락</h1><p>THREADS_APP_ID / THREADS_APP_SECRET 설정 필요.</p>`,
      500,
    );
  }

  // Step 1: short-lived token
  const shortRes = await fetch(
    "https://graph.threads.net/oauth/access_token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: "authorization_code",
        redirect_uri: REDIRECT_URI,
        code,
      }),
    },
  );
  const shortText = await shortRes.text();
  if (!shortRes.ok) {
    return html(
      `<h1>❌ 단기 토큰 교환 실패</h1><pre>${shortText}</pre>`,
      500,
    );
  }
  const shortData = JSON.parse(shortText) as {
    access_token: string;
    user_id: string | number;
  };

  // Step 2: long-lived token (60-day)
  const longUrl = new URL("https://graph.threads.net/access_token");
  longUrl.searchParams.set("grant_type", "th_exchange_token");
  longUrl.searchParams.set("client_secret", appSecret);
  longUrl.searchParams.set("access_token", shortData.access_token);
  const longRes = await fetch(longUrl);
  const longText = await longRes.text();

  let displayToken = shortData.access_token;
  let expiresLine = "단기 토큰 (~1시간)";
  if (longRes.ok) {
    const longData = JSON.parse(longText) as {
      access_token: string;
      expires_in: number;
    };
    displayToken = longData.access_token;
    expiresLine = `장기 토큰 (~${Math.floor(longData.expires_in / 86400)}일)`;
  }

  return html(`
<h1>✅ Threads 토큰 발급 완료</h1>
<p class="ok">아래 토큰을 복사해서 Claude에게 알려주세요.</p>
<h3>${expiresLine}</h3>
<pre id="t">${displayToken}</pre>
<p>유저 ID: <code>${shortData.user_id}</code></p>
<button onclick="navigator.clipboard.writeText(document.getElementById('t').textContent);this.textContent='✅ 복사됨!'">📋 토큰 복사</button>
<hr style="margin:30px 0">
<div class="warn">
⚠️ 보안 안내<br>
1. 이 토큰은 외부 공유 금지 (60일간 유효).<br>
2. OAuth flow가 끝났으니 대시보드에서 <strong>"앱 시크릿 재설정"</strong>해주세요. 이전 시크릿이 채팅에 노출됐으니, 새 시크릿으로 갈고 위 토큰만 보관하시면 됩니다. (기존 토큰은 시크릿 리셋 후에도 그대로 동작)
</div>
  `);
}
